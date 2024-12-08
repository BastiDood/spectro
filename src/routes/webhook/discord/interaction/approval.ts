import assert, { strictEqual } from 'node:assert/strict';

import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';

import { channel, confession } from '$lib/server/database/models';
import { eq } from 'drizzle-orm';

import { MalformedCustomIdFormat, UnexpectedDiscordErrorCode } from './error';

import type { Message } from '$lib/server/models/discord/message';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { approveConfessionLog, dispatchConfessionViaHttp, rejectConfessionLog } from '$lib/server/api/discord';
import { DiscordErrorCode } from '$lib/server/models/discord/error';

import { MANAGE_MESSAGES } from '$lib/server/models/discord/permission';
import { hasAllPermissions } from './util';

abstract class ApprovalError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ApprovalError';
    }
}

class InsufficientPermissionsApprovalError extends ApprovalError {
    constructor() {
        super('You need the **"Manage Messages"** permission to approve/reject confessions.');
        this.name = 'InsufficientPermissionsApprovalError';
    }
}

class DisabledChannelConfessError extends ApprovalError {
    constructor(public disabledAt: Date) {
        const timestamp = Math.floor(disabledAt.valueOf() / 1000);
        super(`The confession channel has been temporarily disabled since <t:${timestamp}:R>.`);
        this.name = 'DisabledChannelConfessError';
    }
}

class AlreadyApprovedApprovalError extends ApprovalError {
    constructor(public timestamp: Date) {
        super(`This confession has already been approved since since <t:${timestamp}:R>.`);
        this.name = 'AlreadyApprovedApprovalError';
    }
}

/**
 * @throws {InsufficientPermissionsApprovalError}
 * @throws {DisabledChannelConfessError}
 * @throws {AlreadyApprovedApprovalError}
 */
async function submitVerdict(
    db: Database,
    logger: Logger,
    timestamp: Date,
    isApproved: boolean,
    logChannelId: Snowflake,
    logMessageId: Snowflake,
    internalId: bigint,
    moderatorId: Snowflake,
    permissions: bigint,
) {
    if (!hasAllPermissions(permissions, MANAGE_MESSAGES)) throw new InsufficientPermissionsApprovalError();
    return await db.transaction(async tx => {
        const [details, ...rest] = await tx
            .select({
                disabledAt: channel.disabledAt,
                label: channel.label,
                color: channel.color,
                parentMessageId: confession.parentMessageId,
                confessionChannelId: confession.channelId,
                confessionId: confession.confessionId,
                authorId: confession.authorId,
                createdAt: confession.createdAt,
                approvedAt: confession.approvedAt,
                content: confession.content,
            })
            .from(confession)
            .innerJoin(channel, eq(confession.channelId, channel.id))
            .where(eq(confession.internalId, internalId))
            .limit(1)
            .for('update');
        strictEqual(rest.length, 0);
        assert(typeof details !== 'undefined');
        const {
            approvedAt,
            createdAt,
            disabledAt,
            authorId,
            confessionChannelId,
            confessionId,
            parentMessageId,
            color,
            label,
            content,
        } = details;
        const hex = color === null ? undefined : Number.parseInt(color, 2);

        const child = logger.child({ details });
        child.info('fetched confession details for approval');

        if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelConfessError(disabledAt);

        if (approvedAt !== null) throw new AlreadyApprovedApprovalError(approvedAt);
        const { rowCount } = await tx
            .update(confession)
            .set({ approvedAt: timestamp })
            .where(eq(confession.internalId, internalId));
        strictEqual(rowCount, 1);

        if (isApproved) {
            const log = await approveConfessionLog(
                child,
                createdAt,
                logChannelId,
                logMessageId,
                label,
                confessionId,
                authorId,
                moderatorId,
                content,
            );

            if (typeof log === 'number') throw new UnexpectedDiscordErrorCode(log);

            const discordErrorCode = await dispatchConfessionViaHttp(
                child,
                createdAt,
                confessionChannelId,
                confessionId,
                label,
                hex,
                content,
                parentMessageId,
            );

            if (typeof discordErrorCode === 'number')
                switch (discordErrorCode) {
                    case DiscordErrorCode.UnknownChannel:
                        child.error('confession channel no longer exists');
                        return `${label} #${confessionId} has been approved internally, but the confession channel no longer exists.`;
                    case DiscordErrorCode.MissingAccess:
                        child.warn('insufficient channel permissions for the confession channel');
                        return `${label} #${confessionId} has been approved internally, but Spectro does not have the permission to send messages to the confession channel. The confession can be resent once this has been resolved.`;
                    default:
                        child.fatal(
                            { discordErrorCode },
                            'unexpected error code when publishing to the confession channel',
                        );
                        return `${label} #${confessionId} has been approved internally, but Spectro encountered an unexpected error (${discordErrorCode}) from Discord while publishing to the confession channel. Kindly inform the developers and the moderators about this issue.`;
                }

            return `${label} #${confessionId} has been approved and published.`;
        }

        const log = await rejectConfessionLog(
            child,
            createdAt,
            logChannelId,
            logMessageId,
            label,
            confessionId,
            authorId,
            moderatorId,
            content,
        );

        if (typeof log === 'number') throw new UnexpectedDiscordErrorCode(log);

        await tx.delete(confession).where(eq(confession.internalId, internalId));
        child.warn('deleted confession due to rejection');

        return `${label} #${confessionId} has been rejected. The confession has been deleted from Spectro's internal logs.`;
    });
}

export async function handleApproval(
    db: Database,
    logger: Logger,
    timestamp: Date,
    customId: string,
    logChannelId: Snowflake,
    logMessageId: Snowflake,
    userId: Snowflake,
    permissions: bigint,
): Promise<Partial<Message>> {
    const [key, id, ...rest] = customId.split(':');
    strictEqual(rest.length, 0);
    assert(typeof id !== 'undefined');
    const internalId = BigInt(id);
    assert(typeof key !== 'undefined');

    // eslint-disable-next-line init-declarations
    let isApproved: boolean;
    switch (key) {
        case 'publish':
            isApproved = true;
            break;
        case 'delete':
            isApproved = false;
            break;
        default:
            throw new MalformedCustomIdFormat(key);
    }

    try {
        const content = await submitVerdict(
            db,
            logger,
            timestamp,
            isApproved,
            logChannelId,
            logMessageId,
            internalId,
            userId,
            permissions,
        );
        return { content };
    } catch (err) {
        if (err instanceof ApprovalError) {
            logger.error(err, err.message);
            return { flags: MessageFlags.Ephemeral, content: err.message };
        }
        throw err;
    }
}
