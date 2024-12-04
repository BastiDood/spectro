import assert, { strictEqual } from 'node:assert/strict';

import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';

import type { Guild } from '$lib/server/models/discord/guild';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import type { TokenResponse } from '$lib/server/models/oauth/token-response';
import type { User } from '$lib/server/models/discord/user';

import { eq, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

import { app, oauth } from './models';

export const db = drizzle(POSTGRES_DATABASE_URL, { schema: { ...app, ...oauth } });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Interface = Database | Transaction;

const CONFESSION_CREATED_AT = sql.raw(app.confession.createdAt.name);
const CONFESSION_CHANNEL_ID = sql.raw(app.confession.channelId.name);
const CONFESSION_AUTHOR_ID = sql.raw(app.confession.authorId.name);
const CONFESSION_CONFESSION_ID = sql.raw(app.confession.confessionId.name);
const CONFESSION_CONTENT = sql.raw(app.confession.content.name);
const CONFESSION_APPROVED_AT = sql.raw(app.confession.approvedAt.name);
const CONFESSION_PARENT_MESSAGE_ID = sql.raw(app.confession.parentMessageId.name);

const USER_NAME = sql.raw(app.user.name.name);
const USER_GLOBAL_NAME = sql.raw(app.user.globalName.name);
const USER_DISCRIMINATOR = sql.raw(app.user.discriminator.name);
const USER_AVATAR_HASH = sql.raw(app.user.avatarHash.name);
const USER_UPDATED_AT = sql.raw(app.user.updatedAt.name);

const GUILD_NAME = sql.raw(app.guild.name.name);
const GUILD_ICON_HASH = sql.raw(app.guild.iconHash.name);
const GUILD_SPLASH_HASH = sql.raw(app.guild.splashHash.name);
const GUILD_UPDATED_AT = sql.raw(app.guild.updatedAt.name);
const GUILD_LAST_CONFESSION_ID = sql.raw(app.guild.lastConfessionId.name);

export function updateLastConfession(db: Interface, guildId: Snowflake) {
    return db
        .update(app.guild)
        .set({ lastConfessionId: sql`${app.guild.lastConfessionId} + 1` })
        .where(eq(app.guild.id, guildId))
        .returning({ confessionId: app.guild.lastConfessionId });
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
) {
    const guild = updateLastConfession(db, guildId);
    const {
        rows: [result, ...otherResults],
    } = await db.execute(
        sql`WITH _guild AS ${guild} INSERT INTO ${app.confession} (${CONFESSION_CREATED_AT}, ${CONFESSION_CHANNEL_ID}, ${CONFESSION_AUTHOR_ID}, ${CONFESSION_CONFESSION_ID}, ${CONFESSION_CONTENT}, ${CONFESSION_APPROVED_AT}, ${CONFESSION_PARENT_MESSAGE_ID}) SELECT ${timestamp}, ${channelId}, ${authorId}, _guild.${GUILD_LAST_CONFESSION_ID}, ${description}, ${approvedAt}, ${parentMessageId} FROM _guild RETURNING ${app.confession.confessionId} _confession_id`,
    );
    strictEqual(otherResults.length, 0);
    assert(typeof result !== 'undefined');
    assert(typeof result._confession_id === 'string');
    return BigInt(result._confession_id);
}

export async function upsertUser(db: Interface, user: User, timestamp?: Date) {
    const { rowCount } = await db
        .insert(app.user)
        .values({
            id: user.id,
            name: user.username,
            discriminator: user.discriminator,
            globalName: user.global_name,
            avatarHash: user.avatar,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: app.user.id,
            set: {
                name: sql`excluded.${USER_NAME}`,
                globalName: sql`excluded.${USER_GLOBAL_NAME}`,
                discriminator: sql`excluded.${USER_DISCRIMINATOR}`,
                avatarHash: sql`excluded.${USER_AVATAR_HASH}`,
                updatedAt: sql`excluded.${USER_UPDATED_AT}`,
            },
            // Only update with the most recent information.
            setWhere: lte(app.user.updatedAt, sql`excluded.${USER_UPDATED_AT}`),
        });
    strictEqual(rowCount, 1);
}

export async function upsertGuild(db: Interface, guild: Guild, timestamp?: Date) {
    await db
        .insert(app.guild)
        .values({
            id: guild.id,
            name: guild.name,
            iconHash: guild.icon,
            splashHash: guild.banner,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: app.guild.id,
            set: {
                name: sql`excluded.${GUILD_NAME}`,
                iconHash: sql`excluded.${GUILD_ICON_HASH}`,
                splashHash: sql`excluded.${GUILD_SPLASH_HASH}`,
                updatedAt: sql`excluded.${GUILD_UPDATED_AT}`,
            },
            // Only update with the most recent information.
            setWhere: lte(app.guild.updatedAt, sql`excluded.${GUILD_UPDATED_AT}`),
        });
}

export async function getUserFromSessionId(db: Interface, sid: oauth.Session['id']) {
    const session = await db.query.session.findFirst({
        columns: {},
        with: { user: { columns: { id: true, name: true, discriminator: true, globalName: true, avatarHash: true } } },
        where(sessions, { and, eq, lt, sql }) {
            return and(eq(sessions.id, sid), lt(sql`NOW()`, sessions.expiresAt));
        },
    });
    return session?.user;
}

export async function generatePendingSession(db: Interface) {
    const [session, ...rest] = await db.insert(oauth.pending).values({}).returning();
    strictEqual(rest.length, 0);
    assert(typeof session !== 'undefined');
    return session;
}

export async function deletePendingSession(db: Interface, sid: oauth.Pending['id']) {
    const [pending, ...rest] = await db.delete(oauth.pending).where(eq(oauth.pending.id, sid)).returning();
    strictEqual(rest.length, 0);
    return pending;
}

export async function upgradePendingSession(
    db: Interface,
    sid: oauth.Pending['id'],
    uid: User['id'],
    token: TokenResponse,
) {
    const [session, ...rest] = await db
        .insert(oauth.session)
        .values({
            id: sid,
            userId: uid,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            expiresAt: sql`NOW() + make_interval(secs => ${token.expires_in})`,
        })
        .returning({ expiresAt: oauth.session.expiresAt });
    strictEqual(rest.length, 0);
    assert(typeof session !== 'undefined');
    return session.expiresAt;
}
