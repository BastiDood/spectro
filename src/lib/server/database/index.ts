import type { Guild } from '$lib/server/models/discord/guild';
import type { User } from '$lib/server/models/discord/user';

import { strictEqual } from 'node:assert/strict';

import * as models from './models';
import { lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Database = NodePgDatabase<typeof models>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type Interface = Database | Transaction;

const USER_NAME = sql.raw(models.user.name.name);
const USER_AVATAR_HASH = sql.raw(models.user.avatarHash.name);
const USER_UPDATED_AT = sql.raw(models.user.updatedAt.name);

const GUILD_NAME = sql.raw(models.guild.name.name);
const GUILD_ICON_HASH = sql.raw(models.guild.iconHash.name);
const GUILD_SPLASH_HASH = sql.raw(models.guild.splashHash.name);
const GUILD_UPDATED_AT = sql.raw(models.guild.updatedAt.name);

export async function upsertUser(db: Interface, timestamp: Date, user: User) {
    const { rowCount } = await db
        .insert(models.user)
        .values({
            id: user.id,
            name: user.username,
            avatarHash: user.avatar,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: models.user.id,
            set: {
                name: sql`excluded.${USER_NAME}`,
                avatarHash: sql`excluded.${USER_AVATAR_HASH}`,
                updatedAt: sql`excluded.${USER_UPDATED_AT}`,
            },
            // Only update with the most recent information.
            setWhere: lte(models.user.updatedAt, sql`excluded.${USER_UPDATED_AT}`),
        });
    strictEqual(rowCount, 1);
}

export async function upsertGuild(db: Interface, timestamp: Date, guild: Guild) {
    await db
        .insert(models.guild)
        .values({
            id: guild.id,
            name: guild.name,
            iconHash: guild.icon,
            splashHash: guild.banner,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: models.guild.id,
            set: {
                name: sql`excluded.${GUILD_NAME}`,
                iconHash: sql`excluded.${GUILD_ICON_HASH}`,
                splashHash: sql`excluded.${GUILD_SPLASH_HASH}`,
                updatedAt: sql`excluded.${GUILD_UPDATED_AT}`,
            },
            // Only update with the most recent information.
            setWhere: lte(models.guild.updatedAt, sql`excluded.${GUILD_UPDATED_AT}`),
        });
}
