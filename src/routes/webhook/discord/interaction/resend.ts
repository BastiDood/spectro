import type { Database } from '$lib/server/database';
import { DiscordErrorCode } from '$lib/server/models/discord/error';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { dispatchConfessionViaHttp } from '$lib/server/api/discord';
import { strictEqual } from 'node:assert/strict';

abstract class ResendError extends Error {}

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
    guildId: Snowflake,
    channelId: Snowflake,
    userId: Snowflake,
    confessionId: bigint,
) {
    const permission = await db.query.permission.findFirst({
        columns: { isAdmin: true },
        where(table, { and, eq }) {
            return and(eq(table.guildId, guildId), eq(table.userId, userId));
        },
    });

    // No need to check `is_admin` because this command only requires moderator privileges.
    if (typeof permission === 'undefined') throw new InsufficientPermissionError();

    const confession = await db.query.confession.findFirst({
        with: { channel: { columns: { label: true } } },
        columns: { channelId: true, createdAt: true, content: true, approvedAt: true },
        where(table, { eq }) {
            return eq(table.confessionId, confessionId);
        },
    });

    if (typeof confession === 'undefined') throw new ConfessionNotFoundError(confessionId);
    const {
        channelId: confessionChannelId,
        approvedAt,
        createdAt,
        content,
        channel: { label },
    } = confession;

    if (channelId !== confessionChannelId) throw new ConfessionWrongChannel(confessionChannelId, confessionId);

    if (approvedAt === null) throw new ConfessionNotApprovedError(confessionId);

    const code = await dispatchConfessionViaHttp(channelId, confessionId, label, createdAt, content);
    switch (code) {
        case null:
            return `Confession #${confessionId} has been resent.`;
        case DiscordErrorCode.MissingAccess:
            throw new MissingAccessError();
        default:
            throw new MessageDeliveryError(code);
    }
}

export async function handleResend(
    db: Database,
    guildId: Snowflake,
    channelId: Snowflake,
    userId: Snowflake,
    [option, ...options]: InteractionApplicationCommandChatInputOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.Integer);
    strictEqual(option.name, 'confession');
    try {
        await resendConfession(db, guildId, channelId, userId, BigInt(option.value));
        return 'The confession has been resent to this channel.';
    } catch (err) {
        if (err instanceof ResendError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
