import assert, { strictEqual } from 'node:assert/strict';

import { type Database, insertConfession } from '$lib/server/database';

import { DiscordErrorCode } from '$lib/server/models/discord/error';
import { dispatchConfessionViaHttp } from '$lib/server/api/discord';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponents } from '$lib/server/models/discord/message/component';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

abstract class ReplySubmitError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ReplySubmitError';
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
 * @throws {DisabledChannelError}
 * @throws {MissingAccessError}
 * @throws {MessageDeliveryError}
 */
async function submitReply(
    db: Database,
    timestamp: Date,
    channelId: Snowflake,
    parentMessageId: Snowflake,
    authorId: Snowflake,
    content: string,
) {
    const channel = await db.query.channel.findFirst({
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true, label: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    assert(typeof channel !== 'undefined');
    const { guildId, disabledAt, label, isApprovalRequired } = channel;

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
        return `Your confession (${label} #${confessionId}) has been submitted, but its publication is pending approval.`;
    }

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
            channelId,
            confessionId,
            label,
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

    return `Your confession (${label} #${confessionId}) has been published.`;
}

export async function handleReplySubmit(
    db: Database,
    timestamp: Date,
    channelId: Snowflake,
    authorId: Snowflake,
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
        return await submitReply(db, timestamp, channelId, parentMessageId, authorId, component.value);
    } catch (err) {
        if (err instanceof ReplySubmitError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
