import {
  bigint,
  bit,
  boolean,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const app = pgSchema('app');

export const guild = app.table('guild', {
  id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  // HACK: JSON.stringify cannot serialize a `bigint`, so we just type-cast it anyway.
  lastConfessionId: bigint('last_confession_id', { mode: 'bigint' })
    .notNull()
    .default(0 as unknown as bigint),
});

export type Guild = typeof guild.$inferSelect;
export type NewGuild = typeof guild.$inferInsert;

export const channel = app.table('channel', {
  id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
  guildId: bigint('guild_id', { mode: 'bigint' })
    .notNull()
    .references(() => guild.id, { onDelete: 'cascade' }),
  // TODO: Eventually add the `notNull` constraint once all guilds have transitioned.
  logChannelId: bigint('log_channel_id', { mode: 'bigint' }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  color: bit('color', { dimensions: 24 }),
  isApprovalRequired: boolean('is_approval_required').notNull().default(false),
  label: text('label').notNull().default('Confession'),
});

export type Channel = typeof channel.$inferSelect;
export type NewChannel = typeof channel.$inferInsert;

export const confession = app.table(
  'confession',
  {
    internalId: bigint('internal_id', { mode: 'bigint' })
      .generatedAlwaysAsIdentity()
      .notNull()
      .primaryKey(),
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
    authorId: bigint('author_id', { mode: 'bigint' }).notNull(),
    content: text('content').notNull(),
  },
  ({ confessionId, channelId }) => [
    uniqueIndex('confession_to_channel_unique_idx').on(confessionId, channelId),
  ],
);

export type Confession = typeof confession.$inferSelect;
export type NewConfession = typeof confession.$inferInsert;

export const ephemeralAttachment = app.table('ephemeral_attachment', {
  id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
  confessionInternalId: bigint('confession_internal_id', { mode: 'bigint' })
    .notNull()
    .references(() => confession.internalId, { onDelete: 'cascade' })
    .unique(),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  url: text('url').notNull(),
  proxyUrl: text('proxy_url').notNull(),
});

export type EphemeralAttachment = typeof ephemeralAttachment.$inferSelect;
export type NewEphemeralAttachment = typeof ephemeralAttachment.$inferInsert;

export const durableAttachment = app.table('durable_attachment', {
  id: bigint('id', { mode: 'bigint' }).notNull().primaryKey(),
  ephemeralAttachmentId: bigint('ephemeral_attachment_id', { mode: 'bigint' })
    .notNull()
    .references(() => ephemeralAttachment.id, { onDelete: 'cascade' })
    .unique(),
  messageId: bigint('message_id', { mode: 'bigint' }).notNull(),
  channelId: bigint('channel_id', { mode: 'bigint' }).notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  url: text('url').notNull(),
  proxyUrl: text('proxy_url').notNull(),
  height: integer('height'),
  width: integer('width'),
});

export type DurableAttachment = typeof durableAttachment.$inferSelect;
export type NewDurableAttachment = typeof durableAttachment.$inferInsert;

export const confessionRelations = relations(confession, ({ one }) => ({
  channel: one(channel, { fields: [confession.channelId], references: [channel.id] }),
  attachment: one(ephemeralAttachment, {
    fields: [confession.internalId],
    references: [ephemeralAttachment.confessionInternalId],
  }),
}));

export const ephemeralAttachmentRelations = relations(ephemeralAttachment, ({ one }) => ({
  confession: one(confession, {
    fields: [ephemeralAttachment.confessionInternalId],
    references: [confession.internalId],
  }),
  durableAttachment: one(durableAttachment, {
    fields: [ephemeralAttachment.id],
    references: [durableAttachment.ephemeralAttachmentId],
  }),
}));

export const durableAttachmentRelations = relations(durableAttachment, ({ one }) => ({
  ephemeralAttachment: one(ephemeralAttachment, {
    fields: [durableAttachment.ephemeralAttachmentId],
    references: [ephemeralAttachment.id],
  }),
}));
