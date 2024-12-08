import { strictEqual } from 'node:assert/strict';

import { UnexpectedDiscordErrorCode } from './error';

import { type Database, resetLogChannel } from '$lib/server/database';
import type { Logger } from 'pino';

import { DiscordErrorCode } from '$lib/server/models/discord/error';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { dispatchConfessionViaHttp, logResentConfessionViaHttp } from '$lib/server/api/discord';

abstract class ResendError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ResendError';
    }
}

class ConfessionNotFoundResendError extends ResendError {
    constructor(public confessionId: bigint) {
        super(`Confession #${confessionId} does not exist in this guild.`);
        this.name = 'ConfessionNotFoundResendError';
    }
}

class WrongChannelResendError extends ResendError {
    constructor(
        public channelId: Snowflake,
        public confessionId: bigint,
    ) {
        super(`Confession #${confessionId} can only be resent in <#${channelId}>.`);
        this.name = 'WrongChannelResendError';
    }
}

class NotApprovedResendError extends ResendError {
    constructor(public confessionId: bigint) {
        super(`Confession #${confessionId} has not yet been approved for publication in this channel.`);
        this.name = 'NotApprovedResendError';
    }
}

class MissingLogChannelResendError extends ResendError {
    constructor() {
        super('You cannot resend confessions until a valid confession log channel has been configured.');
        this.name = 'MissingLogChannelResendError';
    }
}

class MissingChannelAccessResendError extends ResendError {
    constructor() {
        super('Spectro does not have the permission to resend confessions to this channel.');
        this.name = 'MissingChannelAccessResendError';
    }
}

/**
 * @throws {ConfessionNotFoundResendError}
 * @throws {WrongChannelResendError}
 * @throws {NotApprovedResendError}
 * @throws {MissingLogChannelResendError}
 * @throws {MissingChannelAccessResendError}
 */
async function resendConfession(
    db: Database,
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    confessionId: bigint,
    moderatorId: Snowflake,
) {
    const confession = await db.query.confession.findFirst({
        with: { channel: { columns: { logChannelId: true, label: true, color: true } } },
        columns: {
            parentMessageId: true,
            channelId: true,
            authorId: true,
            createdAt: true,
            content: true,
            approvedAt: true,
        },
        where(table, { eq }) {
            return eq(table.confessionId, confessionId);
        },
    });

    if (typeof confession === 'undefined') throw new ConfessionNotFoundResendError(confessionId);
    const {
        parentMessageId,
        channelId: confessionChannelId,
        authorId,
        approvedAt,
        createdAt,
        content,
        channel: { logChannelId, label, color },
    } = confession;
    const hex = color === null ? undefined : Number.parseInt(color, 2);

    const child = logger.child({ confession });
    child.info('confession to be resent found');

    if (channelId !== confessionChannelId) throw new WrongChannelResendError(confessionChannelId, confessionId);
    if (approvedAt === null) throw new NotApprovedResendError(confessionId);
    if (logChannelId === null) throw new MissingLogChannelResendError();

    const message = await dispatchConfessionViaHttp(
        child,
        createdAt,
        channelId,
        confessionId,
        label,
        hex,
        content,
        parentMessageId,
    );

    if (typeof message === 'number')
        switch (message) {
            case DiscordErrorCode.MissingAccess:
                throw new MissingChannelAccessResendError();
            default:
                throw new UnexpectedDiscordErrorCode(message);
        }

    child.info('confession resent to the confession channel');
    const discordErrorCode = await logResentConfessionViaHttp(
        child,
        timestamp,
        logChannelId,
        confessionId,
        authorId,
        moderatorId,
        label,
        content,
    );

    if (typeof discordErrorCode === 'number')
        switch (discordErrorCode) {
            case DiscordErrorCode.UnknownChannel:
                if (await resetLogChannel(db, logChannelId)) child.error('log channel reset due to unknown channel');
                else child.warn('log channel previously reset due to unknown channel');
                return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession because the log channel had been deleted.`;
            case DiscordErrorCode.MissingAccess:
                child.warn('insufficient channel permissions for the log channel');
                return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession due to insufficient log channel permissions.`;
            default:
                child.fatal({ discordErrorCode }, 'unexpected error code when logging resent confession');
                return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession due to an unexpected error (${discordErrorCode}) from Discord. You can retry this command later to ensure that it's properly logged.`;
        }

    child.info('resent confession forwarded to the log channel');
    return `${label} #${confessionId} has been resent.`;
}

export async function handleResend(
    db: Database,
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    moderatorId: Snowflake,
    [option, ...options]: InteractionApplicationCommandChatInputOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.Integer);
    strictEqual(option.name, 'confession');

    const confessionId = BigInt(option.value);
    try {
        await resendConfession(db, logger, timestamp, channelId, confessionId, moderatorId);
        return 'The confession has been resent to this channel.';
    } catch (err) {
        if (err instanceof ResendError) {
            logger.error(err);
            return err.message;
        }
        throw err;
    }
}
