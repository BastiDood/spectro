import { and, eq, sql } from 'drizzle-orm';

import * as schema from '$lib/server/database/models';
import { assertOptional, assertSingle } from '$lib/assert';
import {
  type InsertableAttachment,
  type Interface,
  insertConfession,
  type Transaction,
} from '$lib/server/database';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { UnexpectedRowCountDatabaseError } from '$lib/server/database/errors';

const SERVICE_NAME = 'inngest.process-confession-submission.query';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

interface CreateConfessionSubmissionParams {
  createdAt: Date;
  guildId: bigint;
  channelId: bigint;
  authorId: bigint;
  content: string;
  isApprovalRequired: boolean;
  parentMessageId: bigint | null;
  attachment: InsertableAttachment | null;
  newThreadTitle: string | null;
  existingThreadId: bigint | null;
}

export async function loadConfessionSubmissionChannel(db: Interface, channelId: bigint) {
  return await db
    .select({
      guildId: schema.channel.guildId,
      logChannelId: schema.channel.logChannelId,
      disabledAt: schema.channel.disabledAt,
      isApprovalRequired: schema.channel.isApprovalRequired,
      label: schema.channel.label,
      color: schema.channel.color,
    })
    .from(schema.channel)
    .where(eq(schema.channel.id, channelId))
    .limit(1)
    .then(assertOptional);
}

export async function insertPendingChannelThread(db: Interface, channelId: bigint, title: string) {
  return await tracer.asyncSpan('insert-pending-channel-thread', async span => {
    span.setAttribute('channel.id', channelId.toString());

    const { id } = await db
      .insert(schema.pendingChannelThread)
      .values({
        channelId,
        kind: 'new-thread',
        title,
      })
      .returning({ id: schema.pendingChannelThread.id })
      .then(assertSingle);

    logger.debug('pending channel thread inserted', { 'pending.channel.thread.id': id.toString() });
    return id;
  });
}

export async function insertApprovedChannelThread(
  db: Interface,
  pendingChannelThreadId: bigint,
  threadId: bigint,
) {
  return await tracer.asyncSpan('insert-approved-channel-thread', async span => {
    span.setAttributes({
      'pending.channel.thread.id': pendingChannelThreadId.toString(),
      'thread.id': threadId.toString(),
    });

    const { rowCount } = await db.insert(schema.approvedChannelThread).values({
      pendingChannelThreadId,
      threadId,
    });

    switch (rowCount) {
      case null:
        return UnexpectedRowCountDatabaseError.throwNew();
      case 1:
        logger.debug('approved channel thread inserted');
        return;
      default:
        return UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }
  });
}

async function setConfessionPendingChannelThread(
  db: Interface,
  internalId: bigint,
  pendingChannelThreadId: bigint,
) {
  return await tracer.asyncSpan('set-confession-pending-channel-thread', async span => {
    span.setAttributes({
      'confession.internal.id': internalId.toString(),
      'pending.channel.thread.id': pendingChannelThreadId.toString(),
    });

    const { rowCount } = await db
      .update(schema.confession)
      .set({ pendingChannelThreadId })
      .where(eq(schema.confession.internalId, internalId));

    switch (rowCount) {
      case null:
        return UnexpectedRowCountDatabaseError.throwNew();
      case 1:
        logger.debug('confession pending channel thread set');
        return;
      default:
        return UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }
  });
}

async function loadPendingChannelThreadIdForApprovedThread(
  db: Interface,
  channelId: bigint,
  threadId: bigint,
) {
  const { pendingChannelThreadId } = await db
    .select({ pendingChannelThreadId: schema.pendingChannelThread.id })
    .from(schema.approvedChannelThread)
    .innerJoin(
      schema.pendingChannelThread,
      eq(schema.approvedChannelThread.pendingChannelThreadId, schema.pendingChannelThread.id),
    )
    .where(
      and(
        eq(schema.pendingChannelThread.channelId, channelId),
        eq(schema.approvedChannelThread.threadId, threadId),
      ),
    )
    .limit(1)
    .then(assertSingle);
  return pendingChannelThreadId;
}

export async function loadApprovedThreadTitle(db: Interface, channelId: bigint, threadId: bigint) {
  const { title } = await db
    .select({ title: schema.pendingChannelThread.title })
    .from(schema.approvedChannelThread)
    .innerJoin(
      schema.pendingChannelThread,
      eq(schema.approvedChannelThread.pendingChannelThreadId, schema.pendingChannelThread.id),
    )
    .where(
      and(
        eq(schema.pendingChannelThread.channelId, channelId),
        eq(schema.approvedChannelThread.threadId, threadId),
      ),
    )
    .limit(1)
    .then(assertSingle);
  return title;
}

export async function ensureExistingThreadRegistration(
  db: Transaction,
  isApprovalRequired: boolean,
  channelId: string,
  threadId: string,
  title: string,
) {
  return await tracer.asyncSpan('ensure-existing-thread-registration', async span => {
    span.setAttributes({
      'channel.id': channelId,
      'thread.id': threadId,
      title,
    });

    // Acquires advisory lock to prevent race on creating the
    // same approved channel thread by multiple requests.
    await db.execute(sql`select pg_advisory_xact_lock(${BigInt(threadId)})`);

    const existing = await db
      .select({ pendingChannelThreadId: schema.pendingChannelThread.id })
      .from(schema.approvedChannelThread)
      .innerJoin(
        schema.pendingChannelThread,
        eq(schema.approvedChannelThread.pendingChannelThreadId, schema.pendingChannelThread.id),
      )
      .where(
        and(
          eq(schema.pendingChannelThread.channelId, BigInt(channelId)),
          eq(schema.approvedChannelThread.threadId, BigInt(threadId)),
        ),
      )
      .limit(1)
      .then(assertOptional);

    if (typeof existing === 'undefined') {
      // TODO: Eventually allow approval-required channels with thread creation.
      if (isApprovalRequired)
        return 'This channel requires moderator approval, so Spectro cannot register existing threads for anonymous confessions here.';
      const pendingChannelThreadId = await insertPendingChannelThread(db, BigInt(channelId), title);
      await insertApprovedChannelThread(db, pendingChannelThreadId, BigInt(threadId));
    }

    return null;
  });
}

export async function createConfessionSubmission(
  db: Transaction,
  params: CreateConfessionSubmissionParams,
) {
  const { internalId, confessionId } = await insertConfession(
    db,
    params.createdAt,
    params.guildId,
    params.channelId,
    params.authorId,
    params.content,
    params.isApprovalRequired ? null : params.createdAt,
    params.parentMessageId,
    params.attachment,
  );

  if (params.newThreadTitle !== null) {
    const pendingChannelThreadId = await insertPendingChannelThread(
      db,
      params.channelId,
      params.newThreadTitle,
    );
    await setConfessionPendingChannelThread(db, internalId, pendingChannelThreadId);
    return { internalId, confessionId, pendingChannelThreadId };
  }

  if (params.existingThreadId !== null) {
    const pendingChannelThreadId = await loadPendingChannelThreadIdForApprovedThread(
      db,
      params.channelId,
      params.existingThreadId,
    );

    await setConfessionPendingChannelThread(db, internalId, pendingChannelThreadId);
    return { internalId, confessionId, pendingChannelThreadId };
  }

  return { internalId, confessionId, pendingChannelThreadId: null };
}
