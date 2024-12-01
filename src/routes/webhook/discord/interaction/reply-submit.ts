import assert, { strictEqual } from 'node:assert/strict';

import { type Database, insertConfession } from '$lib/server/database';
import { publication } from '$lib/server/database/models';

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

class ApprovalRequiredError extends ReplySubmitError {
    constructor() {
        super('Moderator approval has since been enabled on this channel. Your reply will be discarded.');
        this.name = 'ApprovalRequiredError';
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
 * @throws {UnknownChannelError}
 * @throws {DisabledChannelError}
 * @throws {ApprovalRequiredError}
 * @throws {MissingAccessError}
 * @throws {MessageDeliveryError}
 */
async function submitReply(
    db: Database,
    timestamp: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    referredMessageId: Snowflake,
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

    // TODO: Somehow keep track of which confession is being replied to rather than just failing here.
    if (isApprovalRequired) throw new ApprovalRequiredError();

    const confessionId = await db.transaction(async tx => {
        const [confessionInternalId, confessionId] = await insertConfession(
            tx,
            timestamp,
            guildId,
            channelId,
            authorId,
            content,
            timestamp,
        );

        const message = await dispatchConfessionViaHttp(
            channelId,
            confessionId,
            label,
            timestamp,
            content,
            referredMessageId,
        );

        if (typeof message === 'number')
            switch (message) {
                case DiscordErrorCode.MissingAccess:
                    throw new MissingAccessError();
                default:
                    throw new MessageDeliveryError(message);
            }

        const { rowCount } = await tx
            .insert(publication)
            .values({ confessionInternalId, messageId: message.id, publishedAt: message.timestamp });
        strictEqual(rowCount, 1);
        return confessionId;
    });

    return `Your confession (#${confessionId}) has been published.`;
}

export async function handleReplySubmit(
    db: Database,
    timestamp: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    referredMessageId: Snowflake,
    [row, ...otherRows]: MessageComponents,
) {
    strictEqual(otherRows.length, 0);
    assert(typeof row !== 'undefined');

    const [component, ...otherComponents] = row.components;
    strictEqual(otherComponents.length, 0);
    assert(typeof component !== 'undefined');

    strictEqual(component?.type, MessageComponentType.TextInput);
    assert(typeof component.value !== 'undefined');

    const confessionId = BigInt(component.custom_id);
    console.log('[REPLY_TO_CONFESSION]', channelId, confessionId);

    try {
        return await submitReply(db, timestamp, channelId, authorId, referredMessageId, component.value);
    } catch (err) {
        if (err instanceof ReplySubmitError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
