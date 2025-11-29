import assert, { strictEqual } from 'node:assert/strict';
import process from 'node:process';

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';

import type { Attachment } from '$lib/server/models/discord/attachment';
import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import * as schema from './models';
import { MissingRowCountDatabaseError, UnexpectedRowCountDatabaseError } from './error';

const pool = new pg.Pool({ connectionString: POSTGRES_DATABASE_URL });
process.once('sveltekit:shutdown', () => void pool.end());

export const db = drizzle(pool, { schema });
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

function updateLastConfession(db: Interface, guildId: Snowflake) {
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
  const { rowCount } = await db.insert(schema.attachment).values({
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.content_type,
    url: attachment.url,
    proxyUrl: attachment.proxy_url,
  });
  strictEqual(rowCount, 1);
}

export async function insertConfession(
  db: Transaction,
  timestamp: Date,
  guildId: Snowflake,
  channelId: Snowflake,
  authorId: Snowflake,
  description: string,
  approvedAt: Date | null,
  parentMessageId: Snowflake | null,
  attachment: InsertableAttachment | null,
  shouldInsertAttachment: boolean,
) {
  let attachmentId: bigint | null = null;
  if (attachment !== null) {
    attachmentId = attachment.id;
    if (shouldInsertAttachment) await insertAttachmentData(db, attachment);
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
  // eslint-disable-next-line no-underscore-dangle
  return { internalId: BigInt(result._internal_id), confessionId: BigInt(result._confession_id) };
}

/**
 * @throws {MissingRowCountDatabaseError}
 * @throws {UnexpectedRowCountDatabaseError}
 */
export async function disableConfessionChannel(
  db: Interface,
  channelId: Snowflake,
  disabledAt: Date,
) {
  const { rowCount } = await db
    .update(schema.channel)
    .set({ disabledAt })
    .where(eq(schema.channel.id, channelId));
  switch (rowCount) {
    case null:
      throw new MissingRowCountDatabaseError();
    case 0:
      return false;
    case 1:
      return true;
    default:
      throw new UnexpectedRowCountDatabaseError(rowCount);
  }
}

/**
 * @throws {MissingRowCountDatabaseError}
 * @throws {UnexpectedRowCountDatabaseError}
 */
export async function resetLogChannel(db: Interface, channelId: Snowflake) {
  const { rowCount } = await db
    .update(schema.channel)
    .set({ logChannelId: null })
    .where(eq(schema.channel.id, channelId));
  switch (rowCount) {
    case null:
      throw new MissingRowCountDatabaseError();
    case 0:
      return false;
    case 1:
      return true;
    default:
      throw new UnexpectedRowCountDatabaseError(rowCount);
  }
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

function serializeAttachment(
  attachment: {
    id: bigint;
    filename: string;
    contentType: string | null;
    url: string;
    proxyUrl: string;
  } | null,
) {
  return attachment === null
    ? null
    : ({
        id: attachment.id.toString(),
        filename: attachment.filename,
        contentType: attachment.contentType,
        url: attachment.url,
        proxyUrl: attachment.proxyUrl,
      } as SerializedAttachment);
}

/** Fetch confession for dispatch operations (post-confession, dispatch-approval) */
export async function fetchConfessionForDispatch(confessionInternalId: bigint) {
  const confession = await db.query.confession.findFirst({
    where: ({ internalId }, { eq }) => eq(internalId, confessionInternalId),
    columns: {
      confessionId: true,
      channelId: true,
      content: true,
      createdAt: true,
      approvedAt: true,
      parentMessageId: true,
    },
    with: {
      channel: {
        columns: {
          label: true,
          color: true,
        },
      },
      attachment: true,
    },
  });
  if (typeof confession === 'undefined') return null;
  return {
    confessionId: confession.confessionId.toString(),
    channelId: confession.channelId.toString(),
    content: confession.content,
    createdAt: confession.createdAt.toISOString(),
    approvedAt: confession.approvedAt?.toISOString() ?? null,
    parentMessageId: confession.parentMessageId?.toString() ?? null,
    channel: {
      label: confession.channel.label,
      color: confession.channel.color,
    },
    attachment: serializeAttachment(confession.attachment),
  } as SerializedConfessionForDispatch;
}

/** Fetch confession for log operations (log-confession) */
export async function fetchConfessionForLog(confessionInternalId: bigint) {
  const confession = await db.query.confession.findFirst({
    where: ({ internalId }, { eq }) => eq(internalId, confessionInternalId),
    columns: {
      internalId: true,
      confessionId: true,
      channelId: true,
      authorId: true,
      content: true,
      createdAt: true,
      approvedAt: true,
    },
    with: {
      channel: {
        columns: {
          label: true,
          logChannelId: true,
          isApprovalRequired: true,
        },
      },
      attachment: true,
    },
  });
  if (typeof confession === 'undefined') return null;
  return {
    internalId: confession.internalId.toString(),
    confessionId: confession.confessionId.toString(),
    channelId: confession.channelId.toString(),
    authorId: confession.authorId.toString(),
    content: confession.content,
    createdAt: confession.createdAt.toISOString(),
    approvedAt: confession.approvedAt?.toISOString() ?? null,
    channel: {
      ...confession.channel,
      logChannelId: confession.channel.logChannelId?.toString() ?? null,
    },
    attachment: serializeAttachment(confession.attachment),
  } as SerializedConfessionForLog;
}

/** Fetch confession for resend operations (resend-confession) */
export async function fetchConfessionForResend(confessionInternalId: bigint) {
  const confession = await db.query.confession.findFirst({
    where: ({ internalId }, { eq }) => eq(internalId, confessionInternalId),
    columns: {
      confessionId: true,
      channelId: true,
      authorId: true,
      content: true,
      createdAt: true,
      approvedAt: true,
      parentMessageId: true,
    },
    with: {
      channel: {
        columns: {
          label: true,
          color: true,
          logChannelId: true,
        },
      },
      attachment: true,
    },
  });
  if (typeof confession === 'undefined') return null;
  return {
    confessionId: confession.confessionId.toString(),
    channelId: confession.channelId.toString(),
    authorId: confession.authorId.toString(),
    content: confession.content,
    createdAt: confession.createdAt.toISOString(),
    approvedAt: confession.approvedAt?.toISOString() ?? null,
    parentMessageId: confession.parentMessageId?.toString() ?? null,
    channel: {
      ...confession.channel,
      logChannelId: confession.channel.logChannelId?.toString() ?? null,
    },
    attachment: serializeAttachment(confession.attachment),
  } as SerializedConfessionForResend;
}
