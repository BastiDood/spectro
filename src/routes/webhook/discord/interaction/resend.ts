import { strictEqual } from 'node:assert/strict';

import { UnexpectedDiscordErrorCode } from './error';

import { type Database, resetLogChannel } from '$lib/server/database';
import type { Logger } from 'pino';

import { and, eq } from 'drizzle-orm';
import { channel, confession } from '$lib/server/database/models';

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
        super(`Confession #${confessionId} does not exist in this channel.`);
        this.name = 'ConfessionNotFoundResendError';
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
 * @throws {NotApprovedResendError}
 * @throws {MissingLogChannelResendError}
 * @throws {MissingChannelAccessResendError}
 */
async function resendConfession(
    db: Database,
    logger: Logger,
    timestamp: Date,
    confessionChannelId: Snowflake,
    confessionId: bigint,
    moderatorId: Snowflake,
) {
    const [result, ...others] = await db
        .select({
            logChannelId: channel.logChannelId,
            label: channel.label,
            color: channel.color,
            parentMessageId: confession.parentMessageId,
            authorId: confession.authorId,
            createdAt: confession.createdAt,
            content: confession.content,
            approvedAt: confession.approvedAt,
        })
        .from(confession)
        .innerJoin(channel, eq(confession.channelId, channel.id))
        .where(and(eq(confession.channelId, confessionChannelId), eq(confession.confessionId, confessionId)))
        .limit(1);
    strictEqual(others.length, 0);

    if (typeof result === 'undefined') throw new ConfessionNotFoundResendError(confessionId);
    const { parentMessageId, authorId, approvedAt, createdAt, content, logChannelId, label, color } = result;
    const hex = color === null ? undefined : Number.parseInt(color, 2);

    const child = logger.child({ confession });
    child.info('confession to be resent found');

    if (approvedAt === null) throw new NotApprovedResendError(confessionId);
    if (logChannelId === null) throw new MissingLogChannelResendError();

    const message = await dispatchConfessionViaHttp(
        child,
        createdAt,
        confessionChannelId,
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
                if (await resetLogChannel(db, confessionChannelId))
                    child.error('log channel reset due to unknown channel');
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
        return await resendConfession(db, logger, timestamp, channelId, confessionId, moderatorId);
    } catch (err) {
        if (err instanceof ResendError) {
            logger.error(err, err.message);
            return err.message;
        }
        throw err;
    }
}
