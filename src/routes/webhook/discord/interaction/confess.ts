import { strictEqual } from 'node:assert/strict';

import { type Database, insertConfession } from '$lib/server/database';
import type { Logger } from 'pino';

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
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    description: string,
) {
    const channel = await db.query.channel.findFirst({
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true, label: true, color: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelError();
    const { guildId, disabledAt, color, label, isApprovalRequired } = channel;
    const hex = color === null ? undefined : Number.parseInt(color, 2);

    const child = logger.child({ channel });
    child.info('channel for confession submission found');

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
        child.info({ confessionId }, 'confession submitted but pending approval');
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

        const message = await dispatchConfessionViaHttp(
            logger,
            channelId,
            confessionId,
            label,
            hex,
            timestamp,
            description,
            null,
        );

        if (typeof message === 'number')
            switch (message) {
                case DiscordErrorCode.MissingAccess:
                    throw new MissingAccessError();
                default:
                    throw new MessageDeliveryError(message);
            }

        return confessionId;
    });

    child.info({ confessionId }, 'confession published');
    return `Your confession (${label} #${confessionId}) has been published.`;
}

export async function handleConfess(
    db: Database,
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    [option, ...options]: InteractionApplicationCommandChatInputOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.String);
    strictEqual(option.name, 'content');
    try {
        return await submitConfession(db, logger, timestamp, channelId, authorId, option.value);
    } catch (err) {
        if (err instanceof ConfessionError) {
            logger.error(err);
            return err.message;
        }
        throw err;
    }
}
