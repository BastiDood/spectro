import {
  bigint,
  bit,
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { isNotNull, relations } from 'drizzle-orm';

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

export const channel = app.table(
  'channel',
  {
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
  },
  ({ guildId }) => [index('channel_guild_id_idx').on(guildId)],
);

export type Channel = typeof channel.$inferSelect;
export type NewChannel = typeof channel.$inferInsert;

export const pendingChannelThreadKind = app.enum('pending_channel_thread_kind', [
  'new-thread',
  'new-thread-reply',
]);
export type PendingChannelThreadKind = (typeof pendingChannelThreadKind.enumValues)[number];

export const pendingChannelThread = app.table(
  'pending_channel_thread',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().notNull().primaryKey(),
    channelId: bigint('channel_id', { mode: 'bigint' })
      .notNull()
      .references(() => channel.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    parentMessageId: bigint('parent_message_id', { mode: 'bigint' }),
    kind: pendingChannelThreadKind('kind').notNull(),
  },
  ({ channelId, parentMessageId }) => [
    index('pending_channel_thread_channel_id_idx').on(channelId),
    uniqueIndex('pending_channel_thread_reply_target_unique_idx')
      .on(channelId, parentMessageId)
      .where(isNotNull(parentMessageId)),
  ],
);

export type PendingChannelThread = typeof pendingChannelThread.$inferSelect;
export type NewPendingChannelThread = typeof pendingChannelThread.$inferInsert;

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
    index('confession_channel_id_idx').on(channelId),
    uniqueIndex('confession_to_channel_unique_idx').on(confessionId, channelId),
  ],
);

export type Confession = typeof confession.$inferSelect;
export type NewConfession = typeof confession.$inferInsert;

export const pendingChannelThreadTitle = app.table(
  'pending_channel_thread_title',
  {
    confessionInternalId: bigint('confession_internal_id', { mode: 'bigint' })
      .notNull()
      .primaryKey()
      .references(() => confession.internalId, { onDelete: 'cascade' }),
    pendingChannelThreadId: bigint('pending_channel_thread_id', { mode: 'bigint' })
      .notNull()
      .references(() => pendingChannelThread.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
  },
  ({ confessionInternalId, pendingChannelThreadId }) => [
    index('pending_channel_thread_title_pending_channel_thread_id_idx').on(pendingChannelThreadId),
    uniqueIndex('pending_channel_thread_title_confession_thread_unique_idx').on(
      confessionInternalId,
      pendingChannelThreadId,
    ),
  ],
);

export type PendingChannelThreadTitle = typeof pendingChannelThreadTitle.$inferSelect;
export type NewPendingChannelThreadTitle = typeof pendingChannelThreadTitle.$inferInsert;

export const approvedChannelThread = app.table('approved_channel_thread', {
  threadId: bigint('thread_id', { mode: 'bigint' }).notNull().primaryKey(),
  pendingChannelThreadTitleConfessionInternalId: bigint(
    'pending_channel_thread_title_confession_internal_id',
    { mode: 'bigint' },
  )
    .notNull()
    .references(() => pendingChannelThreadTitle.confessionInternalId, { onDelete: 'cascade' })
    .unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ApprovedChannelThread = typeof approvedChannelThread.$inferSelect;
export type NewApprovedChannelThread = typeof approvedChannelThread.$inferInsert;

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

export const channelRelations = relations(channel, ({ many }) => ({
  pendingChannelThreads: many(pendingChannelThread),
}));

export const pendingChannelThreadRelations = relations(pendingChannelThread, ({ one, many }) => ({
  channel: one(channel, {
    fields: [pendingChannelThread.channelId],
    references: [channel.id],
  }),
  titles: many(pendingChannelThreadTitle),
}));

export const approvedChannelThreadRelations = relations(approvedChannelThread, ({ one }) => ({
  pendingChannelThreadTitle: one(pendingChannelThreadTitle, {
    fields: [approvedChannelThread.pendingChannelThreadTitleConfessionInternalId],
    references: [pendingChannelThreadTitle.confessionInternalId],
  }),
}));

export const pendingChannelThreadTitleRelations = relations(
  pendingChannelThreadTitle,
  ({ one }) => ({
    confession: one(confession, {
      fields: [pendingChannelThreadTitle.confessionInternalId],
      references: [confession.internalId],
    }),
    pendingChannelThread: one(pendingChannelThread, {
      fields: [pendingChannelThreadTitle.pendingChannelThreadId],
      references: [pendingChannelThread.id],
    }),
    approvedChannelThread: one(approvedChannelThread, {
      fields: [pendingChannelThreadTitle.confessionInternalId],
      references: [approvedChannelThread.pendingChannelThreadTitleConfessionInternalId],
    }),
  }),
);

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
