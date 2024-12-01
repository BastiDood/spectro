import { strictEqual } from 'node:assert/strict';

import { type Database, insertConfession } from '$lib/server/database';

import { DiscordErrorCode } from '$lib/server/models/discord/error';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { dispatchConfessionViaHttp } from '$lib/server/api/discord';

abstract class ConfessionError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ConfessionError';
    }
}

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

/**
 * @throws {UnknownChannelError}
 * @throws {DisabledChannelError}
 * @throws {MissingAccessError}
 * @throws {MessageDeliveryError}
 */
async function submitConfession(
    db: Database,
    timestamp: Date,
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

    if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelError(disabledAt);

    if (isApprovalRequired) {
        const confessionId = await insertConfession(
            db,
            timestamp,
            guildId,
            channelId,
            authorId,
            description,
            null,
            null,
        );
        return `Your confession (${label} #${confessionId}) has been submitted, but its publication is pending approval.`;
    }

    const confessionId = await db.transaction(async tx => {
        const confessionId = await insertConfession(
            tx,
            timestamp,
            guildId,
            channelId,
            authorId,
            description,
            timestamp,
            null,
        );

        const message = await dispatchConfessionViaHttp(channelId, confessionId, label, timestamp, description, null);
        if (typeof message === 'number')
            switch (message) {
                case DiscordErrorCode.MissingAccess:
                    throw new MissingAccessError();
                default:
                    throw new MessageDeliveryError(message);
            }

        return confessionId;
    });

    return `Your confession (${label} #${confessionId}) has been published.`;
}

export async function handleConfess(
    db: Database,
    timestamp: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    [option, ...options]: InteractionApplicationCommandChatInputOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.String);
    strictEqual(option.name, 'content');
    try {
        return await submitConfession(db, timestamp, channelId, authorId, option.value);
    } catch (err) {
        if (err instanceof ConfessionError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
