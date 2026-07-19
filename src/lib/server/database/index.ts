import process from 'node:process';

import { aliasedTable, and, eq, sql } from 'drizzle-orm';

import { AssertionError, assertSingle, UnreachableCodeError } from '$lib/assert';
import type { Attachment } from '$lib/server/models/discord/attachment';
import { Logger } from '$lib/server/telemetry/logger';
import { normalizeDiscordAttachmentUrl } from '$lib/url/discord';
import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';
import { SPECTRO_DATABASE_DRIVER } from '$lib/server/env/spectro';
import { Tracer } from '$lib/server/telemetry/tracer';

import * as schema from './models';
import { UnexpectedRowCountDatabaseError } from './errors';

const SERVICE_NAME = 'database';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

async function init() {
  if (SPECTRO_DATABASE_DRIVER === 'pg') {
    const [{ drizzle }, { Pool }] = await Promise.all([
      import('drizzle-orm/node-postgres'),
      import('pg'),
    ]);
    const pool = new Pool({ connectionString: POSTGRES_DATABASE_URL });
    process.once(
      'sveltekit:shutdown',
      async () =>
        await tracer.asyncSpan('shutdown-pg-database', async () => {
          await pool.end();
          logger.debug('database shutdown');
        }),
    );
    return drizzle(pool, { schema });
  }

  if (SPECTRO_DATABASE_DRIVER === 'neon') {
    const [{ drizzle }, { Pool }] = await Promise.all([
      import('drizzle-orm/neon-serverless'),
      import('@neondatabase/serverless'),
    ]);
    const pool = new Pool({ connectionString: POSTGRES_DATABASE_URL });
    process.once(
      'sveltekit:shutdown',
      async () =>
        await tracer.asyncSpan('shutdown-neon-database', async () => {
          await pool.end();
          logger.debug('database shutdown');
        }),
    );
    return drizzle(pool, { schema });
  }

  return UnreachableCodeError.throwNew();
}

export const db = await init();
export type Database = typeof db;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Interface = Database | Transaction;

export type InsertableAttachment = Pick<
  Attachment,
  'id' | 'filename' | 'content_type' | 'url' | 'proxy_url'
>;

interface FlatApprovedChannelThreadResolutionRow {
  pendingChannelThreadId: bigint;
  pendingApprovalTitleConfessionInternalId: bigint | null;
  pendingApprovalThreadId: bigint | null;
  threadApprovalPendingChannelThreadId: bigint | null;
  threadApprovalTitleConfessionInternalId: bigint | null;
  threadApprovalThreadId: bigint | null;
}

interface ResolvedApprovedChannelThread {
  pendingChannelThreadId: bigint;
  confessionInternalId: bigint;
  threadId: bigint;
}

interface ApprovedChannelThreadResolution {
  pendingChannelThreadId: bigint;
  approvedForPending: ResolvedApprovedChannelThread | null;
  approvedForThread: ResolvedApprovedChannelThread | null;
}

interface NullableResolvedApprovedChannelThreadRow {
  pendingChannelThreadId: bigint | null;
  confessionInternalId: bigint | null;
  threadId: bigint | null;
}

export interface PersistableDurableAttachment {
  id: string;
  messageId: string;
  channelId: string;
  filename: string;
  contentType: string | null;
  url: string;
  proxyUrl: string;
  height: number | null;
  width: number | null;
}

function createResolvedApprovedChannelThread(
  row: NullableResolvedApprovedChannelThreadRow,
  expectedPendingChannelThreadId: bigint | null,
) {
  if (row.threadId === null) {
    if (row.pendingChannelThreadId !== null)
      AssertionError.throwNew('invalid approved channel thread row: pending owner without thread');
    if (row.confessionInternalId !== null)
      AssertionError.throwNew('invalid approved channel thread row: title owner without thread');
    return null;
  }

  if (row.pendingChannelThreadId === null)
    AssertionError.throwNew('invalid approved channel thread row: pending owner missing');
  if (
    expectedPendingChannelThreadId !== null &&
    row.pendingChannelThreadId !== expectedPendingChannelThreadId
  )
    AssertionError.throwNew('invalid approved channel thread row: pending owner mismatch');
  if (row.confessionInternalId === null)
    AssertionError.throwNew('invalid approved channel thread row: title owner missing');

  return {
    pendingChannelThreadId: row.pendingChannelThreadId,
    confessionInternalId: row.confessionInternalId,
    threadId: row.threadId,
  };
}

function createApprovedChannelThreadResolution(
  row: FlatApprovedChannelThreadResolutionRow,
): ApprovedChannelThreadResolution {
  return {
    pendingChannelThreadId: row.pendingChannelThreadId,
    approvedForPending: createResolvedApprovedChannelThread(
      {
        pendingChannelThreadId:
          row.pendingApprovalThreadId === null ? null : row.pendingChannelThreadId,
        confessionInternalId: row.pendingApprovalTitleConfessionInternalId,
        threadId: row.pendingApprovalThreadId,
      },
      row.pendingChannelThreadId,
    ),
    approvedForThread: createResolvedApprovedChannelThread(
      {
        pendingChannelThreadId: row.threadApprovalPendingChannelThreadId,
        confessionInternalId: row.threadApprovalTitleConfessionInternalId,
        threadId: row.threadApprovalThreadId,
      },
      row.pendingChannelThreadId,
    ),
  };
}

async function insertAttachmentData(
  db: Interface,
  confessionInternalId: bigint,
  ephemeralAttachment: InsertableAttachment,
) {
  return await tracer.asyncSpan('insert-attachment', async span => {
    span.setAttributes({
      'attachment.id': ephemeralAttachment.id,
      'confession.internal.id': confessionInternalId.toString(),
    });

    const { rowCount } = await db.insert(schema.ephemeralAttachment).values({
      id: BigInt(ephemeralAttachment.id),
      confessionInternalId,
      filename: ephemeralAttachment.filename,
      contentType: ephemeralAttachment.content_type,
      url: ephemeralAttachment.url,
      proxyUrl: ephemeralAttachment.proxy_url,
    });

    switch (rowCount) {
      case null:
        return UnexpectedRowCountDatabaseError.throwNew();
      case 1:
        break;
      default:
        return UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }

    logger.debug('attachment inserted');
  });
}

export async function upsertDurableAttachmentData(
  db: Interface,
  ephemeralAttachmentId: bigint,
  durableAttachment: PersistableDurableAttachment,
) {
  return await tracer.asyncSpan('upsert-durable-attachment', async span => {
    span.setAttributes({
      'attachment.id': ephemeralAttachmentId.toString(),
      'durable.attachment.id': durableAttachment.id,
      'durable.message.id': durableAttachment.messageId,
      'durable.channel.id': durableAttachment.channelId,
    });
    await db
      .insert(schema.durableAttachment)
      .values({
        id: BigInt(durableAttachment.id),
        ephemeralAttachmentId,
        messageId: BigInt(durableAttachment.messageId),
        channelId: BigInt(durableAttachment.channelId),
        filename: durableAttachment.filename,
        contentType: durableAttachment.contentType,
        url: normalizeDiscordAttachmentUrl(durableAttachment.url),
        proxyUrl: normalizeDiscordAttachmentUrl(durableAttachment.proxyUrl),
        height: durableAttachment.height,
        width: durableAttachment.width,
      })
      .onConflictDoUpdate({
        target: schema.durableAttachment.ephemeralAttachmentId,
        set: {
          id: sql`excluded.${sql.raw(schema.durableAttachment.id.name)}`,
          messageId: sql`excluded.${sql.raw(schema.durableAttachment.messageId.name)}`,
          channelId: sql`excluded.${sql.raw(schema.durableAttachment.channelId.name)}`,
          filename: sql`excluded.${sql.raw(schema.durableAttachment.filename.name)}`,
          contentType: sql`excluded.${sql.raw(schema.durableAttachment.contentType.name)}`,
          url: sql`excluded.${sql.raw(schema.durableAttachment.url.name)}`,
          proxyUrl: sql`excluded.${sql.raw(schema.durableAttachment.proxyUrl.name)}`,
          height: sql`excluded.${sql.raw(schema.durableAttachment.height.name)}`,
          width: sql`excluded.${sql.raw(schema.durableAttachment.width.name)}`,
        },
      });
  });
}

export async function insertConfession(
  db: Transaction,
  createdAt: Date,
  guildId: bigint,
  channelId: bigint,
  authorId: bigint,
  content: string,
  approvedAt: Date | null,
  parentMessageId: bigint | null,
  attachment: InsertableAttachment | null,
) {
  return await tracer.asyncSpan('insert-confession', async span => {
    span.setAttributes({
      'guild.id': guildId.toString(),
      'channel.id': channelId.toString(),
      'author.id': authorId.toString(),
    });

    const { confessionId } = await db
      .update(schema.guild)
      .set({ lastConfessionId: sql`${schema.guild.lastConfessionId} + 1` })
      .where(eq(schema.guild.id, guildId))
      .returning({ confessionId: schema.guild.lastConfessionId })
      .then(assertSingle);

    const { internalId } = await db
      .insert(schema.confession)
      .values({
        createdAt,
        channelId,
        authorId,
        confessionId,
        content,
        approvedAt,
        parentMessageId,
      })
      .returning({ internalId: schema.confession.internalId })
      .then(assertSingle);

    if (attachment !== null) await insertAttachmentData(db, internalId, attachment);

    logger.debug('confession inserted', {
      'internal.id': internalId.toString(),
      'confession.id': confessionId.toString(),
    });

    return { internalId, confessionId };
  });
}

async function loadApprovedChannelThreadResolution(
  db: Interface,
  confessionInternalId: bigint,
  threadId: bigint,
) {
  return await tracer.asyncSpan('load-approved-channel-thread-resolution', async span => {
    span.setAttributes({
      'pending.channel.thread.title.confession.internal.id': confessionInternalId.toString(),
      'thread.id': threadId.toString(),
    });

    const approvedTitle = aliasedTable(schema.pendingChannelThreadTitle, 'approved_title');
    const approvedThreadForPending = db
      .select({
        pendingChannelThreadId: approvedTitle.pendingChannelThreadId,
        confessionInternalId: schema.approvedChannelThread.confessionInternalId,
        threadId: schema.approvedChannelThread.threadId,
      })
      .from(schema.approvedChannelThread)
      .innerJoin(
        approvedTitle,
        eq(schema.approvedChannelThread.confessionInternalId, approvedTitle.confessionInternalId),
      )
      .as('approved_thread_for_pending');

    const approvedThreadTitle = aliasedTable(
      schema.pendingChannelThreadTitle,
      'approved_thread_title',
    );
    const approvedThreadForThread = db
      .select({
        pendingChannelThreadId: approvedThreadTitle.pendingChannelThreadId,
        confessionInternalId: schema.approvedChannelThread.confessionInternalId,
        threadId: schema.approvedChannelThread.threadId,
      })
      .from(schema.approvedChannelThread)
      .innerJoin(
        approvedThreadTitle,
        eq(
          schema.approvedChannelThread.confessionInternalId,
          approvedThreadTitle.confessionInternalId,
        ),
      )
      .where(eq(schema.approvedChannelThread.threadId, threadId))
      .as('approved_thread_for_thread');

    const row = await db
      .select({
        pendingChannelThreadId: schema.pendingChannelThreadTitle.pendingChannelThreadId,
        pendingApprovalTitleConfessionInternalId: approvedThreadForPending.confessionInternalId,
        pendingApprovalThreadId: approvedThreadForPending.threadId,
        threadApprovalPendingChannelThreadId: approvedThreadForThread.pendingChannelThreadId,
        threadApprovalTitleConfessionInternalId: approvedThreadForThread.confessionInternalId,
        threadApprovalThreadId: approvedThreadForThread.threadId,
      })
      .from(schema.pendingChannelThreadTitle)
      .leftJoin(
        approvedThreadForPending,
        eq(
          schema.pendingChannelThreadTitle.pendingChannelThreadId,
          approvedThreadForPending.pendingChannelThreadId,
        ),
      )
      .leftJoin(
        approvedThreadForThread,
        and(
          eq(
            schema.pendingChannelThreadTitle.pendingChannelThreadId,
            approvedThreadForThread.pendingChannelThreadId,
          ),
          eq(approvedThreadForThread.threadId, threadId),
        ),
      )
      .where(eq(schema.pendingChannelThreadTitle.confessionInternalId, confessionInternalId))
      .limit(1)
      .then(assertSingle);

    return createApprovedChannelThreadResolution(row);
  });
}

export async function resolveApprovedChannelThread(
  db: Transaction,
  threadId: bigint,
  confessionInternalId: bigint,
) {
  return await tracer.asyncSpan('resolve-approved-channel-thread', async span => {
    span.setAttributes({
      'pending.channel.thread.title.confession.internal.id': confessionInternalId.toString(),
      'thread.id': threadId.toString(),
    });

    const resolution = await loadApprovedChannelThreadResolution(
      db,
      confessionInternalId,
      threadId,
    );
    const { pendingChannelThreadId } = resolution;
    span.setAttribute('pending.channel.thread.id', pendingChannelThreadId.toString());

    if (resolution.approvedForPending !== null) return resolution.approvedForPending;

    await db.execute(sql`select pg_advisory_xact_lock(${pendingChannelThreadId})`);

    const resolutionAfterLock = await loadApprovedChannelThreadResolution(
      db,
      confessionInternalId,
      threadId,
    );
    if (resolutionAfterLock.approvedForPending !== null)
      return resolutionAfterLock.approvedForPending;

    if (resolutionAfterLock.approvedForThread !== null)
      return resolutionAfterLock.approvedForThread;

    const { rowCount } = await db.insert(schema.approvedChannelThread).values({
      confessionInternalId,
      threadId,
    });

    switch (rowCount) {
      case null:
        return UnexpectedRowCountDatabaseError.throwNew();
      case 1:
        logger.debug('approved channel thread inserted');
        return {
          pendingChannelThreadId,
          confessionInternalId,
          threadId,
        };
      default:
        return UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }
  });
}

/** @throws {UnexpectedRowCountDatabaseError} */
export async function disableConfessionChannel(db: Interface, channelId: bigint, disabledAt: Date) {
  return await tracer.asyncSpan('disable-confession-channel', async span => {
    span.setAttributes({
      'channel.id': channelId.toString(),
      'disabled.at': disabledAt.toISOString(),
    });

    const { rowCount } = await db
      .update(schema.channel)
      .set({ disabledAt })
      .where(eq(schema.channel.id, channelId));

    switch (rowCount) {
      case null:
        return UnexpectedRowCountDatabaseError.throwNew();
      case 0:
        logger.debug('confession channel not found for disable');
        return false;
      case 1:
        logger.debug('confession channel disabled');
        return true;
      default:
        return UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }
  });
}

/** @throws {UnexpectedRowCountDatabaseError} */
export async function resetLogChannel(db: Interface, channelId: bigint) {
  return await tracer.asyncSpan('reset-log-channel', async span => {
    span.setAttribute('channel.id', channelId.toString());

    const { rowCount } = await db
      .update(schema.channel)
      .set({ logChannelId: null })
      .where(eq(schema.channel.id, channelId));

    switch (rowCount) {
      case null:
        return UnexpectedRowCountDatabaseError.throwNew();
      case 0:
        logger.debug('confession channel not found for log reset');
        return false;
      case 1:
        logger.debug('log channel reset');
        return true;
      default:
        return UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }
  });
}
