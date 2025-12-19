import assert, { strictEqual } from 'node:assert/strict';
import process from 'node:process';

import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import { eq, sql } from 'drizzle-orm';

import { assertOptional } from '$lib/assert';
import type { Attachment } from '$lib/server/models/discord/attachment';
import { Logger } from '$lib/server/telemetry/logger';
import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';
import { SPECTRO_DATABASE_DRIVER } from '$lib/server/env/spectro';
import { Tracer } from '$lib/server/telemetry/tracer';

import * as schema from './models';
import { UnknownDatabaseDriverError, UnexpectedRowCountDatabaseError } from './errors';

const SERVICE_NAME = 'database';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

function init() {
  switch (SPECTRO_DATABASE_DRIVER) {
    case 'pg': {
      const pool = new PgPool({ connectionString: POSTGRES_DATABASE_URL });
      process.once('sveltekit:shutdown', async () => await pool.end());
      return pgDrizzle(pool, { schema });
    }
    case 'neon': {
      const pool = new NeonPool({ connectionString: POSTGRES_DATABASE_URL });
      process.once('sveltekit:shutdown', async () => await pool.end());
      return neonDrizzle(pool, { schema });
    }
    default:
      throw new UnknownDatabaseDriverError(SPECTRO_DATABASE_DRIVER);
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
async function insertAttachmentData(db: Interface, attachment: InsertableAttachment) {
  return await tracer.asyncSpan('insert-attachment', async span => {
    span.setAttribute('attachment.id', attachment.id);

    const { rowCount } = await db.insert(schema.attachment).values({
      id: BigInt(attachment.id),
      filename: attachment.filename,
      contentType: attachment.content_type,
      url: attachment.url,
      proxyUrl: attachment.proxy_url,
    });

    switch (rowCount) {
      case null:
        UnexpectedRowCountDatabaseError.throwNew();
      case 1:
        break;
      default:
        UnexpectedRowCountDatabaseError.throwNew(rowCount);
    }

    logger.debug('attachment inserted');
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
    // eslint-disable-next-line no-underscore-dangle
    assert(typeof result._internal_id === 'string');
    // eslint-disable-next-line no-underscore-dangle
    assert(typeof result._confession_id === 'string');

    logger.debug('confession inserted', {
      'internal.id': result._internal_id,
      'confession.id': result._confession_id,
    });

    return {
      internalId: BigInt(result._internal_id),
      confessionId: BigInt(result._confession_id),
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
        UnexpectedRowCountDatabaseError.throwNew();
      case 0:
        logger.debug('confession channel not found for disable');
        return false;
      case 1:
        logger.debug('confession channel disabled');
        return true;
      default:
        UnexpectedRowCountDatabaseError.throwNew(rowCount);
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
        UnexpectedRowCountDatabaseError.throwNew();
      case 0:
        logger.debug('confession channel not found for log reset');
        return false;
      case 1:
        logger.debug('log channel reset');
        return true;
      default:
        UnexpectedRowCountDatabaseError.throwNew(rowCount);
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

/** Serialized confession for dispatch operations (post-confession, dispatch-approval) */
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

/** Serialized confession for log operations (log-confession) */
export interface SerializedConfessionForLog {
  internalId: string;
  confessionId: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  approvedAt: string | null;
  channel: {
    label: string;
    logChannelId: string | null;
    isApprovalRequired: boolean;
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

// HACK: Do NOT use the Relations API (`db.query.*.findFirst()` with `with` clauses) in Drizzle.
// The Relations API is not compatible with OpenTelemetry instrumentation, so we use plain query
// builders with explicit `innerJoin`/`leftJoin` operations instead.

/** Fetch confession for dispatch operations (post-confession, dispatch-approval) */
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
        attachmentId: schema.attachment.id,
        attachmentFilename: schema.attachment.filename,
        attachmentContentType: schema.attachment.contentType,
        attachmentUrl: schema.attachment.url,
        attachmentProxyUrl: schema.attachment.proxyUrl,
      })
      .from(schema.confession)
      .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
      .leftJoin(schema.attachment, eq(schema.confession.attachmentId, schema.attachment.id))
      .where(eq(schema.confession.internalId, confessionInternalId))
      .limit(1)
      .then(assertOptional);

    if (typeof result === 'undefined') {
      logger.warn('confession not found for dispatch');
      return null;
    }

    let attachment: SerializedAttachment | null = null;
    if (result.attachmentId !== null) {
      assert(result.attachmentFilename !== null);
      assert(result.attachmentUrl !== null);
      assert(result.attachmentProxyUrl !== null);
      attachment = {
        id: result.attachmentId.toString(),
        filename: result.attachmentFilename,
        contentType: result.attachmentContentType,
        url: result.attachmentUrl,
        proxyUrl: result.attachmentProxyUrl,
      };
    }

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
      attachment,
    } satisfies SerializedConfessionForDispatch;
  });
}

/** Fetch confession for log operations (log-confession) */
export async function fetchConfessionForLog(db: Interface, confessionInternalId: bigint) {
  return await tracer.asyncSpan('fetch-confession-for-log', async span => {
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
        channelLabel: schema.channel.label,
        channelLogChannelId: schema.channel.logChannelId,
        channelIsApprovalRequired: schema.channel.isApprovalRequired,
        attachmentId: schema.attachment.id,
        attachmentFilename: schema.attachment.filename,
        attachmentContentType: schema.attachment.contentType,
        attachmentUrl: schema.attachment.url,
        attachmentProxyUrl: schema.attachment.proxyUrl,
      })
      .from(schema.confession)
      .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
      .leftJoin(schema.attachment, eq(schema.confession.attachmentId, schema.attachment.id))
      .where(eq(schema.confession.internalId, confessionInternalId))
      .limit(1)
      .then(assertOptional);

    if (typeof result === 'undefined') {
      logger.warn('confession not found for log');
      return null;
    }

    let attachment: SerializedAttachment | null = null;
    if (result.attachmentId !== null) {
      assert(result.attachmentFilename !== null);
      assert(result.attachmentUrl !== null);
      assert(result.attachmentProxyUrl !== null);
      attachment = {
        id: result.attachmentId.toString(),
        filename: result.attachmentFilename,
        contentType: result.attachmentContentType,
        url: result.attachmentUrl,
        proxyUrl: result.attachmentProxyUrl,
      };
    }

    logger.debug('confession fetched for log', {
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
      channel: {
        label: result.channelLabel,
        logChannelId: result.channelLogChannelId?.toString() ?? null,
        isApprovalRequired: result.channelIsApprovalRequired,
      },
      attachment,
    } satisfies SerializedConfessionForLog;
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
        attachmentId: schema.attachment.id,
        attachmentFilename: schema.attachment.filename,
        attachmentContentType: schema.attachment.contentType,
        attachmentUrl: schema.attachment.url,
        attachmentProxyUrl: schema.attachment.proxyUrl,
      })
      .from(schema.confession)
      .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
      .leftJoin(schema.attachment, eq(schema.confession.attachmentId, schema.attachment.id))
      .where(eq(schema.confession.internalId, confessionInternalId))
      .limit(1)
      .then(assertOptional);

    if (typeof result === 'undefined') {
      logger.warn('confession not found for resend');
      return null;
    }

    let attachment: SerializedAttachment | null = null;
    if (result.attachmentId !== null) {
      assert(result.attachmentFilename !== null);
      assert(result.attachmentUrl !== null);
      assert(result.attachmentProxyUrl !== null);
      attachment = {
        id: result.attachmentId.toString(),
        filename: result.attachmentFilename,
        contentType: result.attachmentContentType,
        url: result.attachmentUrl,
        proxyUrl: result.attachmentProxyUrl,
      };
    }

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
      attachment,
    } satisfies SerializedConfessionForResend;
  });
}
