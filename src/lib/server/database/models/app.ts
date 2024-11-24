import { bigint, boolean, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
    lastConfessionId: bigint('last_confession_id', { mode: 'bigint' }).notNull().default(0n),
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

export const webhook = app.table('webhook', {
    id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
    token: text('token').notNull(),
});

export type Webhook = typeof webhook.$inferSelect;
export type NewWebhook = typeof webhook.$inferInsert;

export const channel = app.table(
    'channel',
    {
        id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
        guildId: bigint('guild_id', { mode: 'bigint' })
            .notNull()
            .references(() => guild.id, { onDelete: 'cascade' }),
        webhookId: bigint('webhook_id', { mode: 'bigint' }).references(() => webhook.id, { onDelete: 'set null' }),
        disabledAt: timestamp('disabled_at', { withTimezone: true }),
        isApprovalRequired: boolean('is_approval_required').notNull().default(false),
        label: text('label').notNull().default('Confession'),
    },
    ({ guildId, id }) => [uniqueIndex('guild_to_channel_unique_idx').on(guildId, id)],
);

export const channelRelations = relations(channel, ({ one }) => ({
    webhook: one(webhook, { fields: [channel.webhookId], references: [webhook.id] }),
}));

export type Channel = typeof channel.$inferSelect;
export type NewChannel = typeof channel.$inferInsert;

export const confession = app.table('confession', {
    channelId: bigint('channel_id', { mode: 'bigint' })
        .notNull()
        .references(() => channel.id),
    // NOTE: The confession ID will be overwritten by a trigger at the database level.
    confessionId: bigint('confession_id', { mode: 'bigint' }).notNull().default(0n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).defaultNow(),
    authorId: bigint('author_id', { mode: 'bigint' })
        .notNull()
        .references(() => user.id),
    content: text('content').notNull(),
});

export type Confession = typeof confession.$inferSelect;
export type NewConfession = typeof confession.$inferInsert;
