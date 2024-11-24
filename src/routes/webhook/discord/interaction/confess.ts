import type { Database } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type NewConfession, confession, guild } from '$lib/server/database/models';
import assert, { strictEqual } from 'node:assert/strict';
import { dispatchConfessionViaWebhook } from '$lib/server/api/discord';
import { eq, sql } from 'drizzle-orm';

export class ConfessUnknownChannelError extends Error {
    constructor(public channelId: Snowflake) {
        super(`unknown channel id ${channelId}`);
        this.name = 'ConfessUnknownChannelError';
    }
}

export class ConfessDisabledChannelError extends Error {
    constructor(public disabledAt: Date) {
        super(`confession channel is disabled ${disabledAt.toISOString()}`);
        this.name = 'ConfessDisabledChannelError';
    }
}

export class ConfessMissingWebhookError extends Error {
    constructor() {
        super('missing confession webhook');
        this.name = 'ConfessMissingWebhookError';
    }
}

export class ConfessWebhookDeliveryError extends Error {
    constructor() {
        super('failed to deliver the webhook');
        this.name = 'ConfessWebhookDeliveryError';
    }
}

const CONFESSION_CREATED_AT = sql.raw(confession.createdAt.name);
const CONFESSION_CHANNEL_ID = sql.raw(confession.channelId.name);
const CONFESSION_AUTHOR_ID = sql.raw(confession.authorId.name);
const CONFESSION_CONFESSION_ID = sql.raw(confession.confessionId.name);
const CONFESSION_CONTENT = sql.raw(confession.content.name);
const CONFESSION_APPROVED_AT = sql.raw(confession.approvedAt.name);
const GUILD_LAST_CONFESSION_ID = sql.raw(guild.lastConfessionId.name);

/**
 * @throws {ConfessUnknownChannelError}
 * @throws {ConfessDisabledChannelError}
 * @throws {ConfessMissingWebhookError}
 * @throws {ConfessWebhookDeliveryError}
 */
export async function submitConfession(
    db: Database,
    createdAt: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    content: string,
) {
    const channel = await db.query.channel.findFirst({
        with: { webhook: true },
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true, label: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    if (typeof channel === 'undefined') throw new ConfessUnknownChannelError(channelId);
    const { guildId, disabledAt, label, isApprovalRequired, webhook } = channel;

    if (disabledAt !== null) throw new ConfessDisabledChannelError(disabledAt);

    if (webhook === null) throw new ConfessMissingWebhookError();
    const { id, token } = webhook;

    const updateLastConfession = db
        .update(guild)
        .set({ lastConfessionId: sql`${guild.lastConfessionId} + 1` })
        .where(eq(guild.id, guildId))
        .returning({ confessionId: guild.lastConfessionId });

    const approvedAt = isApprovalRequired ? sql`NULL` : sql`DEFAULT`;
    const {
        rows: [result, ...otherResults],
    } = await db.execute(
        sql`WITH _guild AS ${updateLastConfession} INSERT INTO ${confession} (${CONFESSION_CREATED_AT}, ${CONFESSION_CHANNEL_ID}, ${CONFESSION_AUTHOR_ID}, ${CONFESSION_CONFESSION_ID}, ${CONFESSION_CONTENT}, ${CONFESSION_APPROVED_AT}) VALUES (${createdAt}, ${channelId}, ${authorId}, _guild.${GUILD_LAST_CONFESSION_ID}, ${content}, ${approvedAt}) RETURNING ${confession.confessionId}`,
    );

    strictEqual(otherResults.length, 0);
    assert(typeof result?.confessionId === 'bigint');

    if (await dispatchConfessionViaWebhook(id, token, result.confessionId, label, createdAt, content)) return;
    throw new ConfessWebhookDeliveryError();
}
