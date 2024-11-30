import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';

import type { Guild } from '$lib/server/models/discord/guild';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import type { User } from '$lib/server/models/discord/user';

import assert, { strictEqual } from 'node:assert/strict';

import * as schema from './models';
import { eq, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

export const db = drizzle(POSTGRES_DATABASE_URL, { schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Interface = Database | Transaction;

const CONFESSION_CREATED_AT = sql.raw(schema.confession.createdAt.name);
const CONFESSION_CHANNEL_ID = sql.raw(schema.confession.channelId.name);
const CONFESSION_AUTHOR_ID = sql.raw(schema.confession.authorId.name);
const CONFESSION_CONFESSION_ID = sql.raw(schema.confession.confessionId.name);
const CONFESSION_CONTENT = sql.raw(schema.confession.content.name);
const CONFESSION_APPROVED_AT = sql.raw(schema.confession.approvedAt.name);

const USER_NAME = sql.raw(schema.user.name.name);
const USER_AVATAR_HASH = sql.raw(schema.user.avatarHash.name);
const USER_UPDATED_AT = sql.raw(schema.user.updatedAt.name);

const GUILD_NAME = sql.raw(schema.guild.name.name);
const GUILD_ICON_HASH = sql.raw(schema.guild.iconHash.name);
const GUILD_SPLASH_HASH = sql.raw(schema.guild.splashHash.name);
const GUILD_UPDATED_AT = sql.raw(schema.guild.updatedAt.name);
const GUILD_LAST_CONFESSION_ID = sql.raw(schema.guild.lastConfessionId.name);

export function updateLastConfession(db: Interface, guildId: Snowflake) {
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
) {
    const guild = updateLastConfession(db, guildId);
    const {
        rows: [result, ...otherResults],
    } = await db.execute(
        sql`WITH _guild AS ${guild} INSERT INTO ${schema.confession} (${CONFESSION_CREATED_AT}, ${CONFESSION_CHANNEL_ID}, ${CONFESSION_AUTHOR_ID}, ${CONFESSION_CONFESSION_ID}, ${CONFESSION_CONTENT}, ${CONFESSION_APPROVED_AT}) SELECT ${timestamp}, ${channelId}, ${authorId}, _guild.${GUILD_LAST_CONFESSION_ID}, ${description}, ${approvedAt} FROM _guild RETURNING ${schema.confession.internalId} _internal_id, ${schema.confession.confessionId} _confession_id`,
    );
    strictEqual(otherResults.length, 0);
    assert(typeof result !== 'undefined');
    assert(typeof result._internal_id === 'string');
    assert(typeof result._confession_id === 'string');
    return [BigInt(result._internal_id), BigInt(result._confession_id)] as [bigint, bigint];
}

export async function upsertUser(db: Interface, timestamp: Date, user: User) {
    const { rowCount } = await db
        .insert(schema.user)
        .values({
            id: user.id,
            name: user.username,
            avatarHash: user.avatar,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: schema.user.id,
            set: {
                name: sql`excluded.${USER_NAME}`,
                avatarHash: sql`excluded.${USER_AVATAR_HASH}`,
                updatedAt: sql`excluded.${USER_UPDATED_AT}`,
            },
            // Only update with the most recent information.
            setWhere: lte(schema.user.updatedAt, sql`excluded.${USER_UPDATED_AT}`),
        });
    strictEqual(rowCount, 1);
}

export async function upsertGuild(db: Interface, timestamp: Date, guild: Guild) {
    // FIXME: Discord does not supply all information about the guild.
    await db
        .insert(schema.guild)
        .values({
            id: guild.id,
            name: guild.name,
            iconHash: guild.icon,
            splashHash: guild.banner,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: schema.guild.id,
            set: {
                name: sql`excluded.${GUILD_NAME}`,
                iconHash: sql`excluded.${GUILD_ICON_HASH}`,
                splashHash: sql`excluded.${GUILD_SPLASH_HASH}`,
                updatedAt: sql`excluded.${GUILD_UPDATED_AT}`,
            },
            // Only update with the most recent information.
            setWhere: lte(schema.guild.updatedAt, sql`excluded.${GUILD_UPDATED_AT}`),
        });
}
