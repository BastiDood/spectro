import type { Database } from '$lib/server/database';
import { DiscordErrorCode } from '$lib/server/models/discord/error';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import assert, { strictEqual } from 'node:assert/strict';
import { confession, guild } from '$lib/server/database/models';
import { eq, sql } from 'drizzle-orm';
import { dispatchConfessionViaHttp } from '$lib/server/api/discord';

abstract class ConfessionError extends Error {}

class UnknownChannelError extends ConfessionError {
    constructor() {
        super('This channel has not been set up for confessions yet.');
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

class MissingAccessError extends ConfessionError {
    constructor() {
        super('Spectro does not have the permission to send messages to this channel.');
        this.name = 'MissingAccessError';
    }
}

class MessageDeliveryError extends ConfessionError {
    constructor(public code: number) {
        super(`The confession message failed delivery with error code ${code}.`);
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
 * @throws {MissingAccessError}
 * @throws {MessageDeliveryError}
 */
async function submitConfession(
    db: Database,
    createdAt: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    description: string,
) {
    const channel = await db.query.channel.findFirst({
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true, label: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelError();
    const { guildId, disabledAt, label, isApprovalRequired } = channel;

    if (disabledAt !== null) throw new DisabledChannelError(disabledAt);

    const updateLastConfession = db
        .update(guild)
        .set({ lastConfessionId: sql`${guild.lastConfessionId} + 1` })
        .where(eq(guild.id, guildId))
        .returning({ confessionId: guild.lastConfessionId });

    const approvedAt = isApprovalRequired ? sql`NULL` : createdAt;
    const {
        rows: [result, ...otherResults],
    } = await db.execute(
        sql`WITH _guild AS ${updateLastConfession} INSERT INTO ${confession} (${CONFESSION_CREATED_AT}, ${CONFESSION_CHANNEL_ID}, ${CONFESSION_AUTHOR_ID}, ${CONFESSION_CONFESSION_ID}, ${CONFESSION_CONTENT}, ${CONFESSION_APPROVED_AT}) SELECT ${createdAt}, ${channelId}, ${authorId}, _guild.${GUILD_LAST_CONFESSION_ID}, ${description}, ${approvedAt} FROM _guild RETURNING ${confession.confessionId} _id`,
    );

    strictEqual(otherResults.length, 0);
    assert(typeof result?._id === 'string');
    const confessionId = BigInt(result._id);

    if (approvedAt instanceof Date) {
        const code = await dispatchConfessionViaHttp(channelId, confessionId, label, createdAt, description);
        switch (code) {
            case null:
                return `Your confession (#${confessionId}) has been published.`;
            case DiscordErrorCode.MissingAccess:
                throw new MissingAccessError();
            default:
                throw new MessageDeliveryError(code);
        }
    }

    return `Your confession (#${confessionId}) has been submitted, but its publication is pending approval.`;
}

export async function handleConfess(
    db: Database,
    createdAt: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    [option, ...options]: InteractionApplicationCommandChatInputOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.String);
    strictEqual(option.name, 'content');
    try {
        return await submitConfession(db, createdAt, channelId, authorId, option.value);
    } catch (err) {
        if (err instanceof ConfessionError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
