import { bigint, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

import { bytea } from './bytea';
import { user } from './app';

export const oauth = pgSchema('oauth');

export const pending = oauth.table('pendings', {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
        .notNull()
        .default(sql`NOW() + INTERVAL '15 minutes'`),
    nonce: bytea('nonce')
        .notNull()
        .default(sql`gen_random_bytes(64)`),
});

export type Pending = typeof pending.$inferSelect;
export type NewPending = typeof pending.$inferInsert;

export const session = oauth.table('sessions', {
    id: uuid('id').primaryKey().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' })
        .notNull()
        .references(() => user.id),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
});

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, { fields: [session.userId], references: [user.id] }),
}));
