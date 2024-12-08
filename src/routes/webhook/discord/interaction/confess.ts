import { strictEqual } from 'node:assert/strict';

import { UnexpectedDiscordErrorCode } from './error';

import { type Database, insertConfession, resetLogChannel } from '$lib/server/database';
import type { Logger } from 'pino';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import {
    dispatchConfessionViaHttp,
    logApprovedConfessionViaHttp,
    logPendingConfessionViaHttp,
} from '$lib/server/api/discord';
import { DiscordErrorCode } from '$lib/server/models/discord/error';

abstract class ConfessError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ConfessError';
    }
}

class UnknownChannelConfessError extends ConfessError {
    constructor() {
        super('This channel has not been set up for confessions yet.');
        this.name = 'UnknownChannelConfessError';
    }
}

class DisabledChannelConfessError extends ConfessError {
    constructor(public disabledAt: Date) {
        const timestamp = Math.floor(disabledAt.valueOf() / 1000);
        super(`This channel has temporarily disabled confessions since <t:${timestamp}:R>.`);
        this.name = 'DisabledChannelConfessError';
    }
}

class MissingLogConfessError extends ConfessError {
    constructor() {
        super('Spectro cannot submit confessions until the moderators have configured a confession log.');
        this.name = 'MissingLogConfessError';
    }
}

class MissingChannelAccessConfessError extends ConfessError {
    constructor() {
        super('Spectro does not have the permission to send messages to this channel.');
        this.name = 'MissingChannelAccessConfessError';
    }
}

/**
 * @throws {UnknownChannelConfessError}
 * @throws {DisabledChannelConfessError}
 * @throws {MissingLogConfessError}
 * @throws {MissingChannelAccessConfessError}
 */
async function submitConfession(
    db: Database,
    logger: Logger,
    timestamp: Date,
    confessionChannelId: Snowflake,
    authorId: Snowflake,
    description: string,
) {
    const channel = await db.query.channel.findFirst({
        columns: {
            logChannelId: true,
            guildId: true,
            disabledAt: true,
            isApprovalRequired: true,
            label: true,
            color: true,
        },
        where({ id }, { eq }) {
            return eq(id, confessionChannelId);
        },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelConfessError();
    const { logChannelId, guildId, disabledAt, color, label, isApprovalRequired } = channel;
    const hex = color === null ? undefined : Number.parseInt(color, 2);

    const child = logger.child({ channel });
    child.info('channel for confession submission found');

    if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelConfessError(disabledAt);
    if (logChannelId === null) throw new MissingLogConfessError();

    if (isApprovalRequired) {
        const { internalId, confessionId } = await insertConfession(
            db,
            timestamp,
            guildId,
            confessionChannelId,
            authorId,
            description,
            null,
            null,
        );

        child.info({ internalId, confessionId }, 'confession pending approval submitted');

        const discordErrorCode = await logPendingConfessionViaHttp(
            child,
            timestamp,
            logChannelId,
            internalId,
            confessionId,
            authorId,
            label,
            description,
        );

        if (typeof discordErrorCode === 'number')
            switch (discordErrorCode) {
                case DiscordErrorCode.UnknownChannel:
                    if (await resetLogChannel(db, logChannelId))
                        child.error('log channel reset due to unknown channel');
                    else child.warn('log channel previously reset due to unknown channel');
                    return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the moderators that Spectro has detected that the log channel had been deleted.`;
                case DiscordErrorCode.MissingAccess:
                    child.error('insufficient channel permissions for the log channel');
                    return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the moderators that Spectro couldn't log the confession due to insufficient log channel permissions.`;
                default:
                    child.fatal({ discordErrorCode }, 'unexpected error code when logging resent confession');
                    return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the developers and the moderators that Spectro couldn't log the confession due to an unexpected error (${discordErrorCode}) from Discord.`;
            }

        child.info('confession pending approval has been logged');
        return `${label} #${confessionId} has been submitted, but its publication is pending approval.`;
    }

    const { internalId, confessionId } = await insertConfession(
        db,
        timestamp,
        guildId,
        confessionChannelId,
        authorId,
        description,
        timestamp,
        null,
    );

    child.info({ internalId, confessionId }, 'confession submitted');

    const message = await dispatchConfessionViaHttp(
        logger,
        timestamp,
        confessionChannelId,
        confessionId,
        label,
        hex,
        description,
        null,
    );

    if (typeof message === 'number')
        switch (message) {
            case DiscordErrorCode.MissingAccess:
                throw new MissingChannelAccessConfessError();
            default:
                throw new UnexpectedDiscordErrorCode(message);
        }

    const discordErrorCode = await logApprovedConfessionViaHttp(
        child,
        timestamp,
        logChannelId,
        confessionId,
        authorId,
        label,
        description,
    );

    if (typeof discordErrorCode === 'number')
        switch (discordErrorCode) {
            case DiscordErrorCode.UnknownChannel:
                if (await resetLogChannel(db, confessionChannelId))
                    child.error('log channel reset due to unknown channel');
                else child.warn('log channel previously reset due to unknown channel');
                return `${label} #${confessionId} has been published, but Spectro couldn't log the confession because the log channel had been deleted. Kindly notify the moderators about the configuration issue.`;
            case DiscordErrorCode.MissingAccess:
                child.warn('insufficient channel permissions to confession log channel');
                return `${label} #${confessionId} has been published, but Spectro couldn't log the confession due to insufficient channel permissions. Kindly notify the moderators about the configuration issue.`;
            default:
                child.fatal({ discordErrorCode }, 'unexpected error code when logging replies');
                return `${label} #${confessionId} has been published, but Spectro couldn't log the confession due to an unexpected error (${discordErrorCode}) from Discord. Kindly notify the developers and the moderators about this issue.`;
        }

    child.info('confession published');
    return `${label} #${confessionId} has been published.`;
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
        if (err instanceof ConfessError) {
            logger.error(err, err.message);
            return err.message;
        }
        throw err;
    }
}
