import { aliasedTable, and, eq, sql } from 'drizzle-orm';

import * as schema from '$lib/server/database/models';
import { AssertionError, assertOptional, assertSingle } from '$lib/assert';
import {
  type InsertableAttachment,
  type Interface,
  insertConfession,
  resolveApprovedChannelThread,
  type Transaction,
} from '$lib/server/database';
import { Tracer } from '$lib/server/telemetry/tracer';
import { UnexpectedRowCountDatabaseError } from '$lib/server/database/errors';

const SERVICE_NAME = 'inngest.process-confession-submission.query';
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
  existingThreadTitle: string | null;
}

interface PendingChannelThreadTarget {
  channelId: bigint;
  parentMessageId: bigint | null;
}

interface FlatPendingChannelThreadRow {
  pendingChannelThreadId: bigint;
  parentMessageId: bigint | null;
  approvedPendingChannelThreadId: bigint | null;
  approvedTitle: string | null;
  approvedThreadId: bigint | null;
}

export async function loadConfessionSubmissionChannel(db: Interface, channelId: bigint) {
  return await tracer.asyncSpan('load-confession-submission-channel', async span => {
    span.setAttribute('spectro.channel.id', channelId.toString());
    const channel = await db
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
    if (typeof channel === 'undefined') {
      span.setAttribute('spectro.confession_channel.found', false);
      return;
    }
    span.setAttributes({
      'spectro.confession_channel.found': true,
      'spectro.discord.guild.id': channel.guildId.toString(),
    });
    if (channel.logChannelId !== null)
      span.setAttribute('spectro.discord.log_channel.id', channel.logChannelId.toString());
    return channel;
  });
}

function createPendingChannelThreadState(row: FlatPendingChannelThreadRow) {
  if (row.approvedThreadId === null) {
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid pending channel thread row: approved owner without thread');
    if (row.approvedTitle !== null)
      AssertionError.throwNew('invalid pending channel thread row: approved title without thread');
    return {
      id: row.pendingChannelThreadId,
      parentMessageId: row.parentMessageId,
      approved: null,
    };
  }

  if (row.approvedPendingChannelThreadId === null)
    AssertionError.throwNew('invalid pending channel thread row: approved owner missing');
  if (row.approvedPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid pending channel thread row: approved owner mismatch');
  if (row.approvedTitle === null)
    AssertionError.throwNew('invalid pending channel thread row: approved title missing');

  return {
    id: row.pendingChannelThreadId,
    title: row.approvedTitle,
    parentMessageId: row.parentMessageId,
    approved: { threadId: row.approvedThreadId },
  };
}

async function insertPendingChannelThread(db: Interface, target: PendingChannelThreadTarget) {
  return await tracer.asyncSpan('insert-pending-channel-thread', async span => {
    span.setAttribute('spectro.channel.id', target.channelId.toString());
    if (target.parentMessageId !== null)
      span.setAttribute('spectro.parent.message.id', target.parentMessageId.toString());

    const kind = target.parentMessageId === null ? 'new-thread' : 'new-thread-reply';
    const { id } = await db
      .insert(schema.pendingChannelThread)
      .values({
        channelId: target.channelId,
        kind,
        parentMessageId: target.parentMessageId,
      })
      .returning({ id: schema.pendingChannelThread.id })
      .then(assertSingle);

    span.setAttribute('spectro.pending.channel.thread.id', id.toString());

    return {
      id,
      parentMessageId: target.parentMessageId,
      approved: null,
    };
  });
}

async function insertPendingChannelThreadTitle(
  db: Interface,
  confessionInternalId: bigint,
  pendingChannelThreadId: bigint,
  title: string,
) {
  return await tracer.asyncSpan('insert-pending-channel-thread-title', async span => {
    span.setAttributes({
      'spectro.confession.internal.id': confessionInternalId.toString(),
      'spectro.pending.channel.thread.id': pendingChannelThreadId.toString(),
    });

    const { rowCount } = await db.insert(schema.pendingChannelThreadTitle).values({
      confessionInternalId,
      pendingChannelThreadId,
      title,
    });
    if (rowCount !== null) span.setAttribute('spectro.database.affected_row_count', rowCount);

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

async function loadPendingChannelThreadByReplyTarget(
  db: Interface,
  channelId: bigint,
  parentMessageId: bigint,
) {
  return await tracer.asyncSpan('load-pending-channel-thread-by-reply-target', async span => {
    span.setAttributes({
      'spectro.channel.id': channelId.toString(),
      'spectro.parent.message.id': parentMessageId.toString(),
    });

    const approvedTitle = aliasedTable(schema.pendingChannelThreadTitle, 'approved_title');
    const approvedThreadForPending = db
      .select({
        approvedPendingChannelThreadId: approvedTitle.pendingChannelThreadId,
        approvedTitle: approvedTitle.title,
        approvedThreadId: schema.approvedChannelThread.threadId,
      })
      .from(schema.approvedChannelThread)
      .innerJoin(
        approvedTitle,
        eq(schema.approvedChannelThread.confessionInternalId, approvedTitle.confessionInternalId),
      )
      .as('approved_thread_for_pending');

    const row = await db
      .select({
        pendingChannelThreadId: schema.pendingChannelThread.id,
        parentMessageId: schema.pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: approvedThreadForPending.approvedPendingChannelThreadId,
        approvedTitle: approvedThreadForPending.approvedTitle,
        approvedThreadId: approvedThreadForPending.approvedThreadId,
      })
      .from(schema.pendingChannelThread)
      .leftJoin(
        approvedThreadForPending,
        eq(schema.pendingChannelThread.id, approvedThreadForPending.approvedPendingChannelThreadId),
      )
      .where(
        and(
          eq(schema.pendingChannelThread.channelId, channelId),
          eq(schema.pendingChannelThread.parentMessageId, parentMessageId),
        ),
      )
      .limit(1)
      .then(assertOptional);
    if (typeof row === 'undefined') {
      span.setAttribute('spectro.pending.channel.thread.found', false);
      return;
    }
    span.setAttributes({
      'spectro.pending.channel.thread.found': true,
      'spectro.pending.channel.thread.id': row.pendingChannelThreadId.toString(),
    });
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
      'spectro.channel.id': channelId.toString(),
      'spectro.thread.id': threadId.toString(),
    });

    const row = await db
      .select({
        pendingChannelThreadId: schema.pendingChannelThreadTitle.pendingChannelThreadId,
        approvedTitle: schema.pendingChannelThreadTitle.title,
        parentMessageId: schema.pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: schema.pendingChannelThreadTitle.pendingChannelThreadId,
        approvedThreadId: schema.approvedChannelThread.threadId,
      })
      .from(schema.approvedChannelThread)
      .innerJoin(
        schema.pendingChannelThreadTitle,
        eq(
          schema.approvedChannelThread.confessionInternalId,
          schema.pendingChannelThreadTitle.confessionInternalId,
        ),
      )
      .innerJoin(
        schema.pendingChannelThread,
        eq(schema.pendingChannelThreadTitle.pendingChannelThreadId, schema.pendingChannelThread.id),
      )
      .where(
        and(
          eq(schema.pendingChannelThread.channelId, channelId),
          eq(schema.approvedChannelThread.threadId, threadId),
        ),
      )
      .limit(1)
      .then(assertOptional);
    if (typeof row === 'undefined') {
      span.setAttribute('spectro.pending.channel.thread.found', false);
      return;
    }

    span.setAttributes({
      'spectro.pending.channel.thread.found': true,
      'spectro.pending.channel.thread.id': row.pendingChannelThreadId.toString(),
    });
    return createPendingChannelThreadState(row);
  });
}

async function ensurePendingChannelThread(db: Transaction, target: PendingChannelThreadTarget) {
  return await tracer.asyncSpan('ensure-pending-channel-thread', async span => {
    span.setAttribute('spectro.channel.id', target.channelId.toString());
    if (target.parentMessageId !== null)
      span.setAttribute('spectro.parent.message.id', target.parentMessageId.toString());

    if (target.parentMessageId !== null) {
      await db.execute(sql`select pg_advisory_xact_lock(${target.parentMessageId})`);

      const existing = await loadPendingChannelThreadByReplyTarget(
        db,
        target.channelId,
        target.parentMessageId,
      );
      if (typeof existing !== 'undefined') {
        span.setAttributes({
          'spectro.pending.channel.thread.id': existing.id.toString(),
          'spectro.pending.channel.thread.resolution': 'existing-reply',
        });
        return existing;
      }

      const approved = await loadPendingChannelThreadForApprovedThread(
        db,
        target.channelId,
        target.parentMessageId,
      );
      if (typeof approved !== 'undefined') {
        span.setAttributes({
          'spectro.pending.channel.thread.id': approved.id.toString(),
          'spectro.pending.channel.thread.resolution': 'existing-approved',
        });
        return approved;
      }
    }

    const created = await insertPendingChannelThread(db, target);
    span.setAttributes({
      'spectro.pending.channel.thread.id': created.id.toString(),
      'spectro.pending.channel.thread.resolution': 'created',
    });
    return created;
  });
}

export async function loadApprovedThreadTitle(db: Interface, channelId: bigint, threadId: bigint) {
  return await tracer.asyncSpan('load-approved-thread-title', async span => {
    span.setAttributes({
      'spectro.channel.id': channelId.toString(),
      'spectro.thread.id': threadId.toString(),
    });

    const { title } = await db
      .select({ title: schema.pendingChannelThreadTitle.title })
      .from(schema.approvedChannelThread)
      .innerJoin(
        schema.pendingChannelThreadTitle,
        eq(
          schema.approvedChannelThread.confessionInternalId,
          schema.pendingChannelThreadTitle.confessionInternalId,
        ),
      )
      .innerJoin(
        schema.pendingChannelThread,
        eq(schema.pendingChannelThreadTitle.pendingChannelThreadId, schema.pendingChannelThread.id),
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

export async function createConfessionSubmission(
  db: Transaction,
  params: CreateConfessionSubmissionParams,
) {
  return await tracer.asyncSpan('create-confession-submission', async span => {
    span.setAttributes({
      'spectro.channel.id': params.channelId.toString(),
      'spectro.author.id': params.authorId.toString(),
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
    span.setAttributes({
      'spectro.confession.internal.id': internalId.toString(),
      'spectro.confession.id': confessionId.toString(),
    });

    if (params.newThreadTitle !== null) {
      const pendingThread = await ensurePendingChannelThread(db, {
        channelId: params.channelId,
        parentMessageId: params.parentMessageId,
      });
      await insertPendingChannelThreadTitle(
        db,
        internalId,
        pendingThread.id,
        params.newThreadTitle,
      );

      if (pendingThread.approved !== null)
        return {
          internalId,
          confessionId,
          pendingThread: {
            ...pendingThread,
            title: params.newThreadTitle,
          },
        };
      return {
        internalId,
        confessionId,
        pendingThread: {
          ...pendingThread,
          title: params.newThreadTitle,
        },
      };
    }

    if (params.existingThreadId !== null) {
      if (params.existingThreadTitle === null)
        AssertionError.throwNew('existing thread title missing');

      const existingPendingThread = await loadPendingChannelThreadForApprovedThread(
        db,
        params.channelId,
        params.existingThreadId,
      );
      if (typeof existingPendingThread !== 'undefined') {
        await insertPendingChannelThreadTitle(
          db,
          internalId,
          existingPendingThread.id,
          params.existingThreadTitle,
        );
        return {
          internalId,
          confessionId,
          pendingThread: { ...existingPendingThread, title: params.existingThreadTitle },
        };
      }

      await db.execute(sql`select pg_advisory_xact_lock(${params.existingThreadId})`);

      const loadedPendingThread = await loadPendingChannelThreadForApprovedThread(
        db,
        params.channelId,
        params.existingThreadId,
      );
      if (typeof loadedPendingThread !== 'undefined') {
        await insertPendingChannelThreadTitle(
          db,
          internalId,
          loadedPendingThread.id,
          params.existingThreadTitle,
        );
        return {
          internalId,
          confessionId,
          pendingThread: {
            ...loadedPendingThread,
            title: params.existingThreadTitle,
          },
        };
      }

      const pendingThread = await insertPendingChannelThread(db, {
        channelId: params.channelId,
        parentMessageId: null,
      });
      await insertPendingChannelThreadTitle(
        db,
        internalId,
        pendingThread.id,
        params.existingThreadTitle,
      );
      const approved = await resolveApprovedChannelThread(db, params.existingThreadId, internalId);
      return {
        internalId,
        confessionId,
        pendingThread: {
          ...pendingThread,
          title: params.existingThreadTitle,
          approved: { threadId: approved.threadId },
        },
      };
    }

    return { internalId, confessionId, pendingThread: null };
  });
}
