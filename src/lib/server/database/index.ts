import assert, { strictEqual } from 'node:assert/strict';
import process from 'node:process';

import { MissingRowCountDatabaseError, UnexpectedRowCountDatabaseError } from './error';

import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';

import type { Attachment } from '$lib/server/models/discord/attachment';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import * as schema from './models';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

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
const CONFESSION_ATTACHMENT_URL = sql.raw(schema.confession.attachmentUrl.name);
const CONFESSION_ATTACHMENT_FILENAME = sql.raw(schema.confession.attachmentFilename.name);
const CONFESSION_ATTACHMENT_TYPE = sql.raw(schema.confession.attachmentType.name);

const GUILD_LAST_CONFESSION_ID = sql.raw(schema.guild.lastConfessionId.name);

function updateLastConfession(db: Interface, guildId: Snowflake) {
    return db
        .update(schema.guild)
        .set({ lastConfessionId: sql`${schema.guild.lastConfessionId} + 1` })
        .where(eq(schema.guild.id, guildId))
        .returning({ confessionId: schema.guild.lastConfessionId });
}

export async function insertConfession(
    db: Interface,
    timestamp: Date,
    guildId: Snowflake,
    channelId: Snowflake,
    authorId: Snowflake,
    description: string,
    approvedAt: Date | null,
    parentMessageId: Snowflake | null,
    attachmentUrl: Attachment['url'] | null,
    attachmentFilename: Attachment['filename'] | null,
    attachmentType: Attachment['content_type'] | null
) {
    const guild = updateLastConfession(db, guildId);
    const {
        rows: [result, ...otherResults],
    } = await db.execute(
        sql`WITH _guild AS ${guild} INSERT INTO ${schema.confession} (${CONFESSION_CREATED_AT}, ${CONFESSION_CHANNEL_ID}, ${CONFESSION_AUTHOR_ID}, ${CONFESSION_CONFESSION_ID}, ${CONFESSION_CONTENT}, ${CONFESSION_APPROVED_AT}, ${CONFESSION_PARENT_MESSAGE_ID}, ${CONFESSION_ATTACHMENT_URL}, ${CONFESSION_ATTACHMENT_FILENAME}, ${CONFESSION_ATTACHMENT_TYPE}) SELECT ${timestamp}, ${channelId}, ${authorId}, _guild.${GUILD_LAST_CONFESSION_ID}, ${description}, ${approvedAt}, ${parentMessageId}, ${attachmentUrl}, ${attachmentFilename}, ${attachmentType} FROM _guild RETURNING ${schema.confession.internalId} _internal_id, ${schema.confession.confessionId} _confession_id`,
    );
    strictEqual(otherResults.length, 0);
    assert(typeof result !== 'undefined');
    assert(typeof result._internal_id === 'string');
    assert(typeof result._confession_id === 'string');
    return { internalId: BigInt(result._internal_id), confessionId: BigInt(result._confession_id) };
}

/**
 * @throws {MissingRowCountDatabaseError}
 * @throws {UnexpectedRowCountDatabaseError}
 */
export async function disableConfessionChannel(db: Interface, channelId: Snowflake, disabledAt: Date) {
    const { rowCount } = await db.update(schema.channel).set({ disabledAt }).where(eq(schema.channel.id, channelId));
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
