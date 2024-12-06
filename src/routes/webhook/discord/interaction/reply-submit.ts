import assert, { strictEqual } from 'node:assert/strict';

import { DiscordErrorCode } from '$lib/server/models/discord/error';
import { dispatchConfessionViaHttp } from '$lib/server/api/discord';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponents } from '$lib/server/models/discord/message/component';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type Database, insertConfession } from '$lib/server/database';
import type { Logger } from 'pino';

import { SEND_MESSAGES } from '$lib/server/models/discord/permission';
import { excludesMask } from './util';

abstract class ReplySubmitError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ReplySubmitError';
    }
}

class InsufficentPermissionError extends ReplySubmitError {
    constructor() {
        super('You need the "Send Messages" permission to anonymously reply in this channel.');
        this.name = 'InsufficentPermissionError';
    }
}

class DisabledChannelError extends ReplySubmitError {
    constructor(public disabledAt: Date) {
        const timestamp = Math.floor(disabledAt.valueOf() / 1000);
        super(`This channel has temporarily disabled confessions since <t:${timestamp}:R>.`);
        this.name = 'DisabledChannelError';
    }
}

class MissingAccessError extends ReplySubmitError {
    constructor() {
        super('Spectro does not have the permission to send messages to this channel.');
        this.name = 'MissingAccessError';
    }
}

class MessageDeliveryError extends ReplySubmitError {
    constructor(public code: number) {
        super(`The confession message failed delivery with error code ${code}.`);
        this.name = 'MessageDeliveryError';
    }
}

/**
 * @throws {InsufficentPermissionError}
 * @throws {DisabledChannelError}
 * @throws {MissingAccessError}
 * @throws {MessageDeliveryError}
 */
async function submitReply(
    db: Database,
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    parentMessageId: Snowflake,
    authorId: Snowflake,
    permissions: bigint,
    content: string,
) {
    if (excludesMask(permissions, SEND_MESSAGES)) throw new InsufficentPermissionError();

    const channel = await db.query.channel.findFirst({
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true, label: true, color: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    assert(typeof channel !== 'undefined');
    const { guildId, disabledAt, label, color, isApprovalRequired } = channel;

    const child = logger.child({ channel });
    child.info('channel for reply submission found');

    if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelError(disabledAt);

    if (isApprovalRequired) {
        const confessionId = await insertConfession(
            db,
            timestamp,
            guildId,
            channelId,
            authorId,
            content,
            null,
            parentMessageId,
        );
        child.info({ confessionId }, 'reply submitted but pending approval');
        return `Your confession (${label} #${confessionId}) has been submitted, but its publication is pending approval.`;
    }

    const hex = color === null ? undefined : Number.parseInt(color, 2);
    const confessionId = await db.transaction(async tx => {
        const confessionId = await insertConfession(
            tx,
            timestamp,
            guildId,
            channelId,
            authorId,
            content,
            timestamp,
            parentMessageId,
        );

        const message = await dispatchConfessionViaHttp(
            child,
            channelId,
            confessionId,
            label,
            hex,
            timestamp,
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

        return confessionId;
    });

    child.info({ confessionId }, 'reply published');
    return `Your confession (${label} #${confessionId}) has been published.`;
}

export async function handleReplySubmit(
    db: Database,
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    permissions: bigint,
    [row, ...otherRows]: MessageComponents,
) {
    strictEqual(otherRows.length, 0);
    assert(typeof row !== 'undefined');

    const [component, ...otherComponents] = row.components;
    strictEqual(otherComponents.length, 0);
    assert(typeof component !== 'undefined');

    strictEqual(component?.type, MessageComponentType.TextInput);
    assert(typeof component.value !== 'undefined');
    const parentMessageId = BigInt(component.custom_id);

    try {
        return await submitReply(
            db,
            logger,
            timestamp,
            channelId,
            parentMessageId,
            authorId,
            permissions,
            component.value,
        );
    } catch (err) {
        if (err instanceof ReplySubmitError) {
            logger.error(err);
            return err.message;
        }
        throw err;
    }
}
