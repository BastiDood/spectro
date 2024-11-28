import {
    type ApplicationCommandDataOption,
    ApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction';
import type { Database } from '$lib/server/database';
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
        super(`Confession #${confessionId} does not exist in this channel.`);
        this.name = 'ConfessionNotFoundError';
    }
}

class ConfessionNotApprovedError extends ResendError {
    constructor(public confessionId: bigint) {
        super(`Confession #${confessionId} has not yet been approved for publication in this channel.`);
        this.name = 'ConfessionNotApprovedError';
    }
}

class MessageDeliveryError extends ResendError {
    constructor() {
        super('The confession message could not be delivered.');
        this.name = 'MessageDeliveryError';
    }
}

/**
 * @throws {InsufficientPermissionError}
 * @throws {ConfessionNotFoundError}
 * @throws {ConfessionNotApprovedError}
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
        columns: {},
        where(table, { and, eq }) {
            return and(eq(table.guildId, guildId), eq(table.userId, userId));
        },
    });

    // No need to check `is_admin` because this command only requires moderator privileges.
    if (typeof permission === 'undefined') throw new InsufficientPermissionError();

    const confession = await db.query.confession.findFirst({
        with: { channel: { columns: { label: true } } },
        columns: { createdAt: true, content: true, approvedAt: true },
        where(table, { and, eq }) {
            return and(eq(table.channelId, channelId), eq(table.confessionId, confessionId));
        },
    });

    if (typeof confession === 'undefined') throw new ConfessionNotFoundError(confessionId);
    const {
        approvedAt,
        createdAt,
        content,
        channel: { label },
    } = confession;

    if (approvedAt === null) throw new ConfessionNotApprovedError(confessionId);

    if (await dispatchConfessionViaHttp(channelId, confessionId, label, createdAt, content)) return;
    throw new MessageDeliveryError();
}

export async function handleResend(
    db: Database,
    guildId: Snowflake,
    channelId: Snowflake,
    userId: Snowflake,
    [option, ...options]: ApplicationCommandDataOption[],
) {
    strictEqual(options.length, 0);
    strictEqual(option?.type, ApplicationCommandDataOptionType.Integer);
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
