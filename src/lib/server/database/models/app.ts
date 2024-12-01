import { bigint, bit, boolean, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const app = pgSchema('app');

export const user = app.table('user', {
    id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    name: text('name').notNull(),
    avatarHash: text('avatar_hash'),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export const guild = app.table('guild', {
    id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    name: text('name').notNull(),
    iconHash: text('icon_hash'),
    splashHash: text('splash_hash'),
    // HACK: JSON.stringify cannot serialize a `bigint`, so we just type-cast it anyway.
    lastConfessionId: bigint('last_confession_id', { mode: 'bigint' })
        .notNull()
        .default(0 as unknown as bigint),
});

export type Guild = typeof guild.$inferSelect;
export type NewGuild = typeof guild.$inferInsert;

export const permission = app.table(
    'permission',
    {
        guildId: bigint('guild_id', { mode: 'bigint' })
            .notNull()
            .references(() => guild.id, { onDelete: 'cascade' }),
        userId: bigint('user_id', { mode: 'bigint' })
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        isAdmin: boolean('is_admin').notNull(),
    },
    ({ userId, guildId }) => [uniqueIndex('user_to_guild_unique_idx').on(userId, guildId)],
);

export type Permission = typeof permission.$inferSelect;
export type NewPermission = typeof permission.$inferInsert;

export const channel = app.table(
    'channel',
    {
        id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
        guildId: bigint('guild_id', { mode: 'bigint' })
            .notNull()
            .references(() => guild.id, { onDelete: 'cascade' }),
        disabledAt: timestamp('disabled_at', { withTimezone: true }),
        color: bit('color', { dimensions: 24 }),
        isApprovalRequired: boolean('is_approval_required').notNull().default(false),
        label: text('label').notNull().default('Confession'),
    },
    ({ guildId, id }) => [uniqueIndex('guild_to_channel_unique_idx').on(guildId, id)],
);

export type Channel = typeof channel.$inferSelect;
export type NewChannel = typeof channel.$inferInsert;

export const confession = app.table(
    'confession',
    {
        internalId: bigint('internal_id', { mode: 'bigint' }).generatedAlwaysAsIdentity().notNull().primaryKey(),
        channelId: bigint('channel_id', { mode: 'bigint' })
            .notNull()
            .references(() => channel.id),
        parentMessageId: bigint('parent_message_id', { mode: 'bigint' }),
        // HACK: JSON.stringify cannot serialize a `bigint`, so we just type-cast it anyway.
        confessionId: bigint('confession_id', { mode: 'bigint' })
            .notNull()
            .default(0 as unknown as bigint),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        approvedAt: timestamp('approved_at', { withTimezone: true }).defaultNow(),
        authorId: bigint('author_id', { mode: 'bigint' })
            .notNull()
            .references(() => user.id),
        content: text('content').notNull(),
    },
    ({ confessionId, channelId }) => [uniqueIndex('confession_to_channel_unique_idx').on(confessionId, channelId)],
);

export type Confession = typeof confession.$inferSelect;
export type NewConfession = typeof confession.$inferInsert;

export const confessionRelations = relations(confession, ({ one }) => ({
    channel: one(channel, { fields: [confession.channelId], references: [channel.id] }),
}));
