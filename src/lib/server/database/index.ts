import process from 'node:process';

import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { Pool as NeonPool } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';

import { assertSingle, UnreachableCodeError } from '$lib/assert';
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

async function insertAttachmentData(db: Interface, ephemeralAttachment: InsertableAttachment) {
  return await tracer.asyncSpan('insert-attachment', async span => {
    span.setAttribute('attachment.id', ephemeralAttachment.id);

    const { rowCount } = await db.insert(schema.ephemeralAttachment).values({
      id: BigInt(ephemeralAttachment.id),
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

function normalizeAttachmentUrl(url: string) {
  const normalizedUrl = new URL(url);
  normalizedUrl.search = '';
  return normalizedUrl.toString();
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
  ephemeralAttachmentId: bigint,
  durableAttachmentId: bigint,
) {
  return await tracer.asyncSpan('link-durable-attachment', async span => {
    span.setAttributes({
      'attachment.id': ephemeralAttachmentId.toString(),
      'durable.attachment.id': durableAttachmentId.toString(),
    });

    const { rowCount } = await db
      .update(schema.ephemeralAttachment)
      .set({ durableAttachmentId })
      .where(eq(schema.ephemeralAttachment.id, ephemeralAttachmentId));

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

    let attachmentId: bigint | null = null;
    if (attachment !== null) {
      attachmentId = BigInt(attachment.id);
      await insertAttachmentData(db, attachment);
    }

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
        attachmentId,
      })
      .returning({ internalId: schema.confession.internalId })
      .then(assertSingle);

    logger.debug('confession inserted', {
      'internal.id': internalId.toString(),
      'confession.id': confessionId.toString(),
    });

    return { internalId, confessionId };
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
