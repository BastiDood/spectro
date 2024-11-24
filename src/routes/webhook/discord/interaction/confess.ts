import {
    type ApplicationCommandDataOption,
    ApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction';
import type { Database } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import assert, { strictEqual } from 'node:assert/strict';
import { confession, guild } from '$lib/server/database/models';
import { eq, sql } from 'drizzle-orm';
import { dispatchConfessionViaHttp } from '$lib/server/api/discord';

abstract class ConfessionError extends Error {}

class UnknownChannelError extends ConfessionError {
    constructor(public channelId: Snowflake) {
        super(`Channel <#${channelId}> does not exist.`);
        this.name = 'UnknownChannelError';
    }
}

class DisabledChannelError extends ConfessionError {
    constructor(public disabledAt: Date) {
        const timestamp = Math.floor(disabledAt.valueOf() / 1000);
        super(`This channel has temporarily disabled confessions since <t:${timestamp}:R>.`);
        this.name = 'DisabledChannelError';
    }
}

class MessageDeliveryError extends ConfessionError {
    constructor() {
        super('The confession message could not be delivered.');
        this.name = 'MessageDeliveryError';
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
 * @throws {UnknownChannelError}
 * @throws {DisabledChannelError}
 * @throws {MessageDeliveryError}
 */
async function submitConfession(
    db: Database,
    createdAt: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    content: string,
) {
    const channel = await db.query.channel.findFirst({
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true, label: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelError(channelId);
    const { guildId, disabledAt, label, isApprovalRequired } = channel;

    if (disabledAt !== null) throw new DisabledChannelError(disabledAt);

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

    if (await dispatchConfessionViaHttp(channelId, result.confessionId, label, createdAt, content)) return;
    throw new MessageDeliveryError();
}

export async function handleConfess(
    db: Database,
    createdAt: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    [option, ...options]: ApplicationCommandDataOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, ApplicationCommandDataOptionType.String);
    strictEqual(option.name, 'content');
    try {
        await submitConfession(db, createdAt, channelId, authorId, option.value);
        return 'Your message has been submitted.';
    } catch (err) {
        if (err instanceof ConfessionError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
