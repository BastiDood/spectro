import { strictEqual } from 'node:assert/strict';

import { UnexpectedDiscordErrorCode } from './errors';
import { doDeferredResponse } from './util';

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

class PendingApprovalResendError extends ResendError {
    constructor(public confessionId: bigint) {
        super(`Confession #${confessionId} has not yet been approved for publication in this channel.`);
        this.name = 'PendingApprovalResendError';
    }
}

class MissingLogChannelResendError extends ResendError {
    constructor() {
        super('You cannot resend confessions until a valid confession log channel has been configured.');
        this.name = 'MissingLogChannelResendError';
    }
}

/**
 * @throws {ConfessionNotFoundResendError}
 * @throws {PendingApprovalResendError}
 * @throws {MissingLogChannelResendError}
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
            attachmentUrl: confession.attachmentUrl,
            attachmentFilename: confession.attachmentFilename,
            attachmentType: confession.attachmentType,
        })
        .from(confession)
        .innerJoin(channel, eq(confession.channelId, channel.id))
        .where(and(eq(confession.channelId, confessionChannelId), eq(confession.confessionId, confessionId)))
        .limit(1);
    strictEqual(others.length, 0);

    if (typeof result === 'undefined') throw new ConfessionNotFoundResendError(confessionId);
    const {
        parentMessageId,
        authorId,
        approvedAt,
        createdAt,
        content,
        logChannelId,
        label,
        color,
        attachmentType,
        attachmentUrl,
        attachmentFilename,
    } = result;
    const hex = color === null ? undefined : Number.parseInt(color, 2);

    logger.info({ confession }, 'confession to be resent found');

    if (approvedAt === null) throw new PendingApprovalResendError(confessionId);
    if (logChannelId === null) throw new MissingLogChannelResendError();

    let attachment = null;
    // check if an attachment exists and reconstruct it
    if (attachmentUrl && attachmentFilename) {
        attachment = {
            filename: attachmentFilename,
            url: attachmentUrl,
            content_type: attachmentType,
        };
    }

    logger.info('confession resend has been submitted');

    // Promise is ignored so that it runs in the background
    void doDeferredResponse(logger, async () => {
        const message = await dispatchConfessionViaHttp(
            logger,
            createdAt,
            confessionChannelId,
            confessionId,
            label,
            hex,
            content,
            parentMessageId,
            attachment
    );

        if (typeof message === 'number')
            switch (message) {
                case DiscordErrorCode.MissingAccess:
                    return 'Spectro does not have the permission to resend confessions to this channel.';
                default:
                    throw new UnexpectedDiscordErrorCode(message);
            }

        logger.info('confession resent to the confession channel');
        const discordErrorCode = await logResentConfessionViaHttp(
            logger,
            timestamp,
            logChannelId,
            confessionId,
            authorId,
            moderatorId,
            label,
            content,
            attachment
        );

        if (typeof discordErrorCode === 'number')
            switch (discordErrorCode) {
                case DiscordErrorCode.UnknownChannel:
                    if (await resetLogChannel(db, confessionChannelId))
                        logger.error('log channel reset due to unknown channel');
                    else logger.warn('log channel previously reset due to unknown channel');
                    return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession because the log channel had been deleted.`;
                case DiscordErrorCode.MissingAccess:
                    logger.warn('insufficient channel permissions for the log channel');
                    return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession due to insufficient log channel permissions.`;
                default:
                    logger.fatal({ discordErrorCode }, 'unexpected error code when logging resent confession');
                    return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession due to an unexpected error (${discordErrorCode}) from Discord. You can retry this command later to ensure that it's properly logged.`;
            }

        logger.info('confession resend has been published');
        return `${label} #${confessionId} has been resent.`;
    });

    return `${label} #${confessionId} has been submitted as a resent confession.`;
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
