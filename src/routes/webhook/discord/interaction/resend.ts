import { strictEqual } from 'node:assert/strict';

import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';

import { DiscordErrorCode } from '$lib/server/models/discord/error';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { MANAGE_MESSAGES } from '$lib/server/models/discord/permission';
import { dispatchConfessionViaHttp } from '$lib/server/api/discord';
import { excludesMask } from './util';

abstract class ResendError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ResendError';
    }
}

class InsufficientPermissionError extends ResendError {
    constructor() {
        super('You do not have the permission to resend confessions for this channel.');
        this.name = 'InsufficientPermissionError';
    }
}

class ConfessionNotFoundError extends ResendError {
    constructor(public confessionId: bigint) {
        super(`Confession #${confessionId} does not exist in this guild.`);
        this.name = 'ConfessionNotFoundError';
    }
}

class ConfessionWrongChannel extends ResendError {
    constructor(
        public channelId: Snowflake,
        public confessionId: bigint,
    ) {
        super(`Confession #${confessionId} can only be resent in <#${channelId}>.`);
        this.name = 'ConfessionNotApprovedError';
    }
}

class ConfessionNotApprovedError extends ResendError {
    constructor(public confessionId: bigint) {
        super(`Confession #${confessionId} has not yet been approved for publication in this channel.`);
        this.name = 'ConfessionNotApprovedError';
    }
}

class MissingAccessError extends ResendError {
    constructor() {
        super('Spectro does not have the permission to resend confessions to this channel.');
        this.name = 'MissingAccessError';
    }
}

class MessageDeliveryError extends ResendError {
    constructor(public code: number) {
        super(`The confession message failed delivery with error code ${code}.`);
        this.name = 'MessageDeliveryError';
    }
}

/**
 * @throws {InsufficientPermissionError}
 * @throws {ConfessionNotFoundError}
 * @throws {ConfessionWrongChannel}
 * @throws {ConfessionNotApprovedError}
 * @throws {MissingAccessError}
 * @throws {MessageDeliveryError}
 */
async function resendConfession(
    db: Database,
    logger: Logger,
    channelId: Snowflake,
    permissions: bigint,
    confessionId: bigint,
) {
    // The moderator must have been able to delete the message to begin with. We thus
    // require the `MANAGE_MESSAGES` permission to ensure that they are still a moderator.
    if (excludesMask(permissions, MANAGE_MESSAGES)) throw new InsufficientPermissionError();

    const confession = await db.query.confession.findFirst({
        with: { channel: { columns: { label: true, color: true } } },
        columns: { parentMessageId: true, channelId: true, createdAt: true, content: true, approvedAt: true },
        where(table, { eq }) {
            return eq(table.confessionId, confessionId);
        },
    });

    if (typeof confession === 'undefined') throw new ConfessionNotFoundError(confessionId);
    const {
        parentMessageId,
        channelId: confessionChannelId,
        approvedAt,
        createdAt,
        content,
        channel: { label, color },
    } = confession;
    const hex = color === null ? undefined : Number.parseInt(color, 2);

    const child = logger.child({ confession });
    child.info('confession to be resent found');

    if (channelId !== confessionChannelId) throw new ConfessionWrongChannel(confessionChannelId, confessionId);

    if (approvedAt === null) throw new ConfessionNotApprovedError(confessionId);

    const message = await dispatchConfessionViaHttp(
        child,
        channelId,
        confessionId,
        label,
        hex,
        createdAt,
        content,
        parentMessageId,
    );

    if (typeof message === 'number')
        switch (message) {
            case DiscordErrorCode.MissingAccess:
                throw new MissingAccessError();
            default:
                throw new MessageDeliveryError(message);
        }

    child.info('confession resent');
    return `${label} #${confessionId} has been resent.`;
}

export async function handleResend(
    db: Database,
    logger: Logger,
    channelId: Snowflake,
    permissions: bigint,
    [option, ...options]: InteractionApplicationCommandChatInputOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.Integer);
    strictEqual(option.name, 'confession');

    const confessionId = BigInt(option.value);
    try {
        await resendConfession(db, logger, channelId, permissions, confessionId);
        return 'The confession has been resent to this channel.';
    } catch (err) {
        if (err instanceof ResendError) {
            logger.error(err);
            return err.message;
        }
        throw err;
    }
}
