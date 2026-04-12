import assert, { strictEqual } from 'node:assert/strict';
import process from 'node:process';

import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { eq, sql } from 'drizzle-orm';

import { assertOptional, UnreachableCodeError } from '$lib/assert';
import type { Attachment } from '$lib/server/models/discord/attachment';
import { Logger } from '$lib/server/telemetry/logger';
import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';
import { SPECTRO_DATABASE_DRIVER } from '$lib/server/env/spectro';
import { Tracer } from '$lib/server/telemetry/tracer';

import * as schema from './models';
import { UnexpectedRowCountDatabaseError } from './errors';

const SERVICE_NAME = 'database';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

function init() {
  switch (SPECTRO_DATABASE_DRIVER) {
    case 'pg': {
      const pool = new PgPool({ connectionString: POSTGRES_DATABASE_URL });
      process.once(
        'sveltekit:shutdown',
        async () =>
          await tracer.asyncSpan('shutdown-pg-database', async () => {
            await pool.end();
            logger.debug('database shutdown');
          }),
      );
      return pgDrizzle(pool, { schema });
    }
    case 'neon': {
      const pool = new NeonPool({ connectionString: POSTGRES_DATABASE_URL });
      process.once(
        'sveltekit:shutdown',
        async () =>
          await tracer.asyncSpan('shutdown-neon-database', async () => {
            await pool.end();
            logger.debug('database shutdown');
          }),
      );
      return neonDrizzle(pool, { schema });
    }
    default:
      UnreachableCodeError.throwNew();
  }
}

export const db = init();
export type Database = typeof db;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Interface = Database | Transaction;

const CONFESSION_CREATED_AT = sql.raw(schema.confession.createdAt.name);
const CONFESSION_CHANNEL_ID = sql.raw(schema.confession.channelId.name);
const CONFESSION_AUTHOR_ID = sql.raw(schema.confession.authorId.name);
const CONFESSION_CONFESSION_ID = sql.raw(schema.confession.confessionId.name);
const CONFESSION_CONTENT = sql.raw(schema.confession.content.name);
const CONFESSION_APPROVED_AT = sql.raw(schema.confession.approvedAt.name);
const CONFESSION_PARENT_MESSAGE_ID = sql.raw(schema.confession.parentMessageId.name);
const CONFESSION_ATTACHMENT_ID = sql.raw(schema.confession.attachmentId.name);

const GUILD_LAST_CONFESSION_ID = sql.raw(schema.guild.lastConfessionId.name);

function updateLastConfession(db: Interface, guildId: bigint) {
  return db
    .update(schema.guild)
    .set({ lastConfessionId: sql`${schema.guild.lastConfessionId} + 1` })
    .where(eq(schema.guild.id, guildId))
    .returning({ confessionId: schema.guild.lastConfessionId });
}

export type InsertableAttachment = Pick<
  Attachment,
  'id' | 'filename' | 'content_type' | 'url' | 'proxy_url'
>;

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

async function insertAttachmentData(db: Interface, attachment: InsertableAttachment) {
  return await tracer.asyncSpan('insert-attachment', async span => {
    span.setAttribute('attachment.id', attachment.id);

    const { rowCount } = await db.insert(schema.ephemeralAttachment).values({
      id: BigInt(attachment.id),
      filename: attachment.filename,
      contentType: attachment.content_type,
      url: attachment.url,
      proxyUrl: attachment.proxy_url,
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

function normalizeAttachmentUrl(url: string) {
  const normalizedUrl = new URL(url);
  normalizedUrl.search = '';
  return normalizedUrl.toString();
}

export async function upsertDurableAttachmentData(
  db: Interface,
  attachmentId: bigint,
  durableAttachment: PersistableDurableAttachment,
) {
  return await tracer.asyncSpan('upsert-durable-attachment', async span => {
    span.setAttributes({
      'attachment.id': attachmentId.toString(),
      'durable.attachment.id': durableAttachment.id,
      'durable.message.id': durableAttachment.messageId,
      'durable.channel.id': durableAttachment.channelId,
    });
    await db
      .insert(schema.durableAttachment)
      .values({
        id: BigInt(durableAttachment.id),
        messageId: BigInt(durableAttachment.messageId),
        channelId: BigInt(durableAttachment.channelId),
        filename: durableAttachment.filename,
        contentType: durableAttachment.contentType,
        url: normalizeAttachmentUrl(durableAttachment.url),
        proxyUrl: normalizeAttachmentUrl(durableAttachment.proxyUrl),
        height: durableAttachment.height,
        width: durableAttachment.width,
      })
      .onConflictDoUpdate({
        target: schema.durableAttachment.id,
        set: {
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

export async function linkDurableAttachmentData(
  db: Interface,
  attachmentId: bigint,
  durableAttachmentId: bigint,
) {
  return await tracer.asyncSpan('link-durable-attachment', async span => {
    span.setAttributes({
      'attachment.id': attachmentId.toString(),
      'durable.attachment.id': durableAttachmentId.toString(),
    });

    const { rowCount } = await db
      .update(schema.ephemeralAttachment)
      .set({ durableAttachmentId })
      .where(eq(schema.ephemeralAttachment.id, attachmentId));

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

export async function insertConfession(
  db: Transaction,
  timestamp: Date,
  guildId: bigint,
  channelId: bigint,
  authorId: bigint,
  description: string,
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

    let attachmentId: bigint | null = null;
    if (attachment !== null) {
      attachmentId = BigInt(attachment.id);
      await insertAttachmentData(db, attachment);
    }

    const guild = updateLastConfession(db, guildId);
    const {
      rows: [result, ...otherResults],
    } = await db.execute(
      sql`WITH _guild AS ${guild} INSERT INTO ${schema.confession} (${CONFESSION_CREATED_AT}, ${CONFESSION_CHANNEL_ID}, ${CONFESSION_AUTHOR_ID}, ${CONFESSION_CONFESSION_ID}, ${CONFESSION_CONTENT}, ${CONFESSION_APPROVED_AT}, ${CONFESSION_PARENT_MESSAGE_ID}, ${CONFESSION_ATTACHMENT_ID}) SELECT ${timestamp}, ${channelId}, ${authorId}, _guild.${GUILD_LAST_CONFESSION_ID}, ${description}, ${approvedAt}, ${parentMessageId}, ${attachmentId} FROM _guild RETURNING ${schema.confession.internalId} _internal_id, ${schema.confession.confessionId} _confession_id`,
    );

    strictEqual(otherResults.length, 0);
    assert(typeof result !== 'undefined');

    const { _internal_id: internalId, _confession_id: confessionId } = result;
    assert(typeof internalId === 'string');
    assert(typeof confessionId === 'string');

    logger.debug('confession inserted', {
      'internal.id': internalId,
      'confession.id': confessionId,
    });

    return {
      internalId: BigInt(internalId),
      confessionId: BigInt(confessionId),
    };
  });
}

/**
 * @throws {MissingRowCountDatabaseError}
 * @throws {UnexpectedRowCountDatabaseError}
 */
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

/**
 * @throws {MissingRowCountDatabaseError}
 * @throws {UnexpectedRowCountDatabaseError}
 */
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

export interface SerializedAttachment {
  id: string;
  filename: string;
  contentType: string | null;
  url: string;
  proxyUrl: string;
  height?: number | null;
  width?: number | null;
}

export interface SerializedConfessionForProcess {
  internalId: string;
  confessionId: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  approvedAt: string | null;
  parentMessageId: string | null;
  channel: {
    label: string;
    color: string | null;
    logChannelId: string | null;
    isApprovalRequired: boolean;
  };
  attachment: SerializedAttachment | null;
}

/** Serialized confession for public dispatch operations */
export interface SerializedConfessionForDispatch {
  confessionId: string;
  channelId: string;
  content: string;
  createdAt: string;
  approvedAt: string | null;
  parentMessageId: string | null;
  channel: {
    label: string;
    color: string | null;
  };
  attachment: SerializedAttachment | null;
}

/** Serialized confession for resend operations (resend-confession) */
export interface SerializedConfessionForResend {
  confessionId: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  approvedAt: string | null;
  parentMessageId: string | null;
  channel: {
    label: string;
    color: string | null;
    logChannelId: string | null;
  };
  attachment: SerializedAttachment | null;
}

function serializeAttachment({
  attachmentId,
  attachmentFilename,
  attachmentContentType,
  attachmentUrl,
  attachmentProxyUrl,
  attachmentHeight,
  attachmentWidth,
}: {
  attachmentId: bigint | null;
  attachmentFilename: string | null;
  attachmentContentType: string | null;
  attachmentUrl: string | null;
  attachmentProxyUrl: string | null;
  attachmentHeight?: number | null;
  attachmentWidth?: number | null;
}) {
  if (attachmentId === null) return null;
  assert(attachmentFilename !== null);
  assert(attachmentUrl !== null);
  assert(attachmentProxyUrl !== null);
  return {
    id: attachmentId.toString(),
    filename: attachmentFilename,
    contentType: attachmentContentType,
    url: attachmentUrl,
    proxyUrl: attachmentProxyUrl,
    height: attachmentHeight,
    width: attachmentWidth,
  } satisfies SerializedAttachment;
}

// HACK: Do NOT use the Relations API (`db.query.*.findFirst()` with `with` clauses) in Drizzle.
// The Relations API is not compatible with OpenTelemetry instrumentation, so we use plain query
// builders with explicit `innerJoin`/`leftJoin` operations instead.

/** Fetch confession for process operations (process-confession) */
export async function fetchConfessionForProcess(db: Interface, confessionInternalId: bigint) {
  return await tracer.asyncSpan('fetch-confession-for-process', async span => {
    span.setAttribute('confession.internal.id', confessionInternalId.toString());

    const result = await db
      .select({
        internalId: schema.confession.internalId,
        confessionId: schema.confession.confessionId,
        channelId: schema.confession.channelId,
        authorId: schema.confession.authorId,
        content: schema.confession.content,
        createdAt: schema.confession.createdAt,
        approvedAt: schema.confession.approvedAt,
        parentMessageId: schema.confession.parentMessageId,
        channelLabel: schema.channel.label,
        channelColor: schema.channel.color,
        channelLogChannelId: schema.channel.logChannelId,
        channelIsApprovalRequired: schema.channel.isApprovalRequired,
        attachmentId: schema.ephemeralAttachment.id,
        attachmentFilename: schema.ephemeralAttachment.filename,
        attachmentContentType: schema.ephemeralAttachment.contentType,
        attachmentUrl: schema.ephemeralAttachment.url,
        attachmentProxyUrl: schema.ephemeralAttachment.proxyUrl,
      })
      .from(schema.confession)
      .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
      .leftJoin(
        schema.ephemeralAttachment,
        eq(schema.confession.attachmentId, schema.ephemeralAttachment.id),
      )
      .where(eq(schema.confession.internalId, confessionInternalId))
      .limit(1)
      .then(assertOptional);

    if (typeof result === 'undefined') {
      logger.warn('confession not found for process');
      return null;
    }

    logger.debug('confession fetched for process', {
      'confession.id': result.confessionId.toString(),
    });

    return {
      internalId: result.internalId.toString(),
      confessionId: result.confessionId.toString(),
      channelId: result.channelId.toString(),
      authorId: result.authorId.toString(),
      content: result.content,
      createdAt: result.createdAt.toISOString(),
      approvedAt: result.approvedAt?.toISOString() ?? null,
      parentMessageId: result.parentMessageId?.toString() ?? null,
      channel: {
        label: result.channelLabel,
        color: result.channelColor,
        logChannelId: result.channelLogChannelId?.toString() ?? null,
        isApprovalRequired: result.channelIsApprovalRequired,
      },
      attachment: serializeAttachment(result),
    } satisfies SerializedConfessionForProcess;
  });
}

/** Fetch confession for public dispatch operations */
export async function fetchConfessionForDispatch(db: Interface, confessionInternalId: bigint) {
  return await tracer.asyncSpan('fetch-confession-for-dispatch', async span => {
    span.setAttribute('confession.internal.id', confessionInternalId.toString());

    const result = await db
      .select({
        confessionId: schema.confession.confessionId,
        channelId: schema.confession.channelId,
        content: schema.confession.content,
        createdAt: schema.confession.createdAt,
        approvedAt: schema.confession.approvedAt,
        parentMessageId: schema.confession.parentMessageId,
        channelLabel: schema.channel.label,
        channelColor: schema.channel.color,
        ephemeralAttachmentId: schema.ephemeralAttachment.id,
        attachmentId: schema.durableAttachment.id,
        attachmentFilename: schema.durableAttachment.filename,
        attachmentContentType: schema.durableAttachment.contentType,
        attachmentUrl: schema.durableAttachment.url,
        attachmentProxyUrl: schema.durableAttachment.proxyUrl,
        attachmentHeight: schema.durableAttachment.height,
        attachmentWidth: schema.durableAttachment.width,
      })
      .from(schema.confession)
      .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
      .leftJoin(
        schema.ephemeralAttachment,
        eq(schema.confession.attachmentId, schema.ephemeralAttachment.id),
      )
      .leftJoin(
        schema.durableAttachment,
        eq(schema.ephemeralAttachment.durableAttachmentId, schema.durableAttachment.id),
      )
      .where(eq(schema.confession.internalId, confessionInternalId))
      .limit(1)
      .then(assertOptional);

    if (typeof result === 'undefined') {
      logger.warn('confession not found for dispatch');
      return null;
    }

    if (result.ephemeralAttachmentId !== null) assert(result.attachmentId !== null);

    logger.debug('confession fetched for dispatch', {
      'confession.id': result.confessionId.toString(),
    });

    return {
      confessionId: result.confessionId.toString(),
      channelId: result.channelId.toString(),
      content: result.content,
      createdAt: result.createdAt.toISOString(),
      approvedAt: result.approvedAt?.toISOString() ?? null,
      parentMessageId: result.parentMessageId?.toString() ?? null,
      channel: {
        label: result.channelLabel,
        color: result.channelColor,
      },
      attachment: serializeAttachment(result),
    } satisfies SerializedConfessionForDispatch;
  });
}

/** Fetch confession for resend operations (resend-confession) */
export async function fetchConfessionForResend(db: Interface, confessionInternalId: bigint) {
  return await tracer.asyncSpan('fetch-confession-for-resend', async span => {
    span.setAttribute('confession.internal.id', confessionInternalId.toString());

    const result = await db
      .select({
        confessionId: schema.confession.confessionId,
        channelId: schema.confession.channelId,
        authorId: schema.confession.authorId,
        content: schema.confession.content,
        createdAt: schema.confession.createdAt,
        approvedAt: schema.confession.approvedAt,
        parentMessageId: schema.confession.parentMessageId,
        channelLabel: schema.channel.label,
        channelColor: schema.channel.color,
        channelLogChannelId: schema.channel.logChannelId,
        ephemeralAttachmentId: schema.ephemeralAttachment.id,
        attachmentId: schema.durableAttachment.id,
        attachmentFilename: schema.durableAttachment.filename,
        attachmentContentType: schema.durableAttachment.contentType,
        attachmentUrl: schema.durableAttachment.url,
        attachmentProxyUrl: schema.durableAttachment.proxyUrl,
        attachmentHeight: schema.durableAttachment.height,
        attachmentWidth: schema.durableAttachment.width,
      })
      .from(schema.confession)
      .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
      .leftJoin(
        schema.ephemeralAttachment,
        eq(schema.confession.attachmentId, schema.ephemeralAttachment.id),
      )
      .leftJoin(
        schema.durableAttachment,
        eq(schema.ephemeralAttachment.durableAttachmentId, schema.durableAttachment.id),
      )
      .where(eq(schema.confession.internalId, confessionInternalId))
      .limit(1)
      .then(assertOptional);

    if (typeof result === 'undefined') {
      logger.warn('confession not found for resend');
      return null;
    }

    if (result.ephemeralAttachmentId !== null) assert(result.attachmentId !== null);

    logger.debug('confession fetched for resend', {
      'confession.id': result.confessionId.toString(),
    });

    return {
      confessionId: result.confessionId.toString(),
      channelId: result.channelId.toString(),
      authorId: result.authorId.toString(),
      content: result.content,
      createdAt: result.createdAt.toISOString(),
      approvedAt: result.approvedAt?.toISOString() ?? null,
      parentMessageId: result.parentMessageId?.toString() ?? null,
      channel: {
        label: result.channelLabel,
        color: result.channelColor,
        logChannelId: result.channelLogChannelId?.toString() ?? null,
      },
      attachment: serializeAttachment(result),
    } satisfies SerializedConfessionForResend;
  });
}
