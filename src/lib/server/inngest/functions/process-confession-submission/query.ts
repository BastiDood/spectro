import { and, eq, sql } from 'drizzle-orm';

import * as schema from '$lib/server/database/models';
import { AssertionError, assertDefined, assertOptional, assertSingle } from '$lib/assert';
import {
  type InsertableAttachment,
  type Interface,
  insertConfession,
  resolveApprovedChannelThread,
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

interface PendingChannelThreadTarget {
  channelId: bigint;
  title: string;
  parentMessageId: bigint | null;
}

interface FlatPendingChannelThreadRow {
  pendingChannelThreadId: bigint;
  title: string;
  parentMessageId: bigint | null;
  approvedPendingChannelThreadId: bigint | null;
  approvedThreadId: bigint | null;
}

export async function loadConfessionSubmissionChannel(db: Interface, channelId: bigint) {
  return await tracer.asyncSpan('load-confession-submission-channel', async span => {
    span.setAttribute('channel.id', channelId.toString());
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
        return;
      default:
        return UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }
  });
}

function createPendingChannelThreadState(row: FlatPendingChannelThreadRow) {
  if (row.approvedThreadId === null) {
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid pending channel thread row: approved owner without thread');
    return {
      id: row.pendingChannelThreadId,
      title: row.title,
      parentMessageId: row.parentMessageId,
      approved: null,
    };
  }

  if (row.approvedPendingChannelThreadId === null)
    AssertionError.throwNew('invalid pending channel thread row: approved owner missing');
  if (row.approvedPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid pending channel thread row: approved owner mismatch');

  return {
    id: row.pendingChannelThreadId,
    title: row.title,
    parentMessageId: row.parentMessageId,
    approved: { threadId: row.approvedThreadId },
  };
}

async function insertPendingChannelThread(db: Interface, target: PendingChannelThreadTarget) {
  return await tracer.asyncSpan('insert-pending-channel-thread', async span => {
    span.setAttribute('channel.id', target.channelId.toString());
    if (target.parentMessageId !== null)
      span.setAttribute('parent.message.id', target.parentMessageId.toString());

    const kind = target.parentMessageId === null ? 'new-thread' : 'new-thread-reply';
    const { id } = await db
      .insert(schema.pendingChannelThread)
      .values({
        channelId: target.channelId,
        kind,
        parentMessageId: target.parentMessageId,
        title: target.title,
      })
      .returning({ id: schema.pendingChannelThread.id })
      .then(assertSingle);

    logger.debug('pending channel thread inserted', { 'pending.channel.thread.id': id.toString() });

    return {
      id,
      title: target.title,
      parentMessageId: target.parentMessageId,
      approved: null,
    };
  });
}

async function loadPendingChannelThreadByReplyTarget(
  db: Interface,
  channelId: bigint,
  parentMessageId: bigint,
) {
  return await tracer.asyncSpan('load-pending-channel-thread-by-reply-target', async span => {
    span.setAttributes({
      'channel.id': channelId.toString(),
      'parent.message.id': parentMessageId.toString(),
    });
    const row = await db
      .select({
        pendingChannelThreadId: schema.pendingChannelThread.id,
        title: schema.pendingChannelThread.title,
        parentMessageId: schema.pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: schema.approvedChannelThread.pendingChannelThreadId,
        approvedThreadId: schema.approvedChannelThread.threadId,
      })
      .from(schema.pendingChannelThread)
      .leftJoin(
        schema.approvedChannelThread,
        eq(schema.pendingChannelThread.id, schema.approvedChannelThread.pendingChannelThreadId),
      )
      .where(
        and(
          eq(schema.pendingChannelThread.channelId, channelId),
          eq(schema.pendingChannelThread.parentMessageId, parentMessageId),
        ),
      )
      .limit(1)
      .then(assertOptional);
    if (typeof row === 'undefined') return;
    return createPendingChannelThreadState(row);
  });
}

async function loadPendingChannelThreadForApprovedThread(
  db: Interface,
  channelId: bigint,
  threadId: bigint,
) {
  return await tracer.asyncSpan('load-pending-channel-thread-for-approved-thread', async span => {
    span.setAttributes({
      'channel.id': channelId.toString(),
      'thread.id': threadId.toString(),
    });

    const row = await db
      .select({
        pendingChannelThreadId: schema.pendingChannelThread.id,
        title: schema.pendingChannelThread.title,
        parentMessageId: schema.pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: schema.approvedChannelThread.pendingChannelThreadId,
        approvedThreadId: schema.approvedChannelThread.threadId,
      })
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
      .then(assertOptional);
    if (typeof row === 'undefined') return;

    return createPendingChannelThreadState(row);
  });
}

async function ensurePendingChannelThread(db: Transaction, target: PendingChannelThreadTarget) {
  return await tracer.asyncSpan('ensure-pending-channel-thread', async span => {
    span.setAttribute('channel.id', target.channelId.toString());
    if (target.parentMessageId !== null)
      span.setAttribute('parent.message.id', target.parentMessageId.toString());

    if (target.parentMessageId !== null) {
      await db.execute(sql`select pg_advisory_xact_lock(${target.parentMessageId})`);

      const existing = await loadPendingChannelThreadByReplyTarget(
        db,
        target.channelId,
        target.parentMessageId,
      );
      if (typeof existing !== 'undefined') {
        logger.debug('found existing thread');
        return existing;
      }

      const approved = await loadPendingChannelThreadForApprovedThread(
        db,
        target.channelId,
        target.parentMessageId,
      );
      if (typeof approved !== 'undefined') {
        logger.debug('found approved thread');
        return approved;
      }
    }

    return await insertPendingChannelThread(db, target);
  });
}

export async function loadApprovedThreadTitle(db: Interface, channelId: bigint, threadId: bigint) {
  return await tracer.asyncSpan('load-approved-thread-title', async span => {
    span.setAttributes({
      'channel.id': channelId.toString(),
      'thread.id': threadId.toString(),
    });

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
  });
}

export async function ensureExistingThreadRegistration(
  db: Transaction,
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

    if (typeof existing !== 'undefined') return null;

    const pending = await insertPendingChannelThread(db, {
      channelId: BigInt(channelId),
      title,
      parentMessageId: null,
    });
    await resolveApprovedChannelThread(db, pending.id, BigInt(threadId));
    return null;
  });
}

export async function createConfessionSubmission(
  db: Transaction,
  params: CreateConfessionSubmissionParams,
) {
  return await tracer.asyncSpan('create-confession-submission', async span => {
    span.setAttributes({
      'channel.id': params.channelId.toString(),
      'author.id': params.authorId.toString(),
      'parent.message.id': params.parentMessageId?.toString(),
      'existing.thread.id': params.existingThreadId?.toString(),
    });

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
      const pendingThread = await ensurePendingChannelThread(db, {
        channelId: params.channelId,
        title: params.newThreadTitle,
        parentMessageId: params.parentMessageId,
      });
      await setConfessionPendingChannelThread(db, internalId, pendingThread.id);
      return { internalId, confessionId, pendingThread };
    }

    if (params.existingThreadId !== null) {
      const pendingThread = assertDefined(
        await loadPendingChannelThreadForApprovedThread(
          db,
          params.channelId,
          params.existingThreadId,
        ),
      );
      await setConfessionPendingChannelThread(db, internalId, pendingThread.id);
      return { internalId, confessionId, pendingThread };
    }

    return { internalId, confessionId, pendingThread: null };
  });
}
