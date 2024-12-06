import type { InteractionCallbackMessage } from '$lib/server/models/discord/interaction-callback/message';
import type { InteractionCallbackModal } from '$lib/server/models/discord/interaction-callback/modal';
import { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';

import { SEND_MESSAGES } from '$lib/server/models/discord/permission';
import { excludesMask } from './util';

abstract class ReplyModalError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ReplyError';
    }
}

class InsufficentPermissionError extends ReplyModalError {
    constructor() {
        super('You need the "Send Messages" permission to anonymously reply in this channel.');
        this.name = 'InsufficentPermissionError';
    }
}

class UnknownChannelError extends ReplyModalError {
    constructor() {
        super('This channel has not been set up for confessions yet.');
        this.name = 'UnknownChannelError';
    }
}

class DisabledChannelError extends ReplyModalError {
    constructor(public disabledAt: Date) {
        const timestamp = Math.floor(disabledAt.valueOf() / 1000);
        super(`This channel has temporarily disabled confessions (including replies) since <t:${timestamp}:R>.`);
        this.name = 'DisabledChannelError';
    }
}

class ApprovalRequiredError extends ReplyModalError {
    constructor() {
        super('You cannot (yet) reply to a confession in a channel that requires moderator approval.');
        this.name = 'ApprovalRequiredError';
    }
}

/**
 * @throws {InsufficentPermissionError}
 * @throws {UnknownChannelError}
 * @throws {DisabledChannelError}
 * @throws {ApprovalRequiredError}
 */
async function renderReplyModal(
    db: Database,
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    messageId: Snowflake,
    permissions: bigint,
) {
    if (excludesMask(permissions, SEND_MESSAGES)) throw new InsufficentPermissionError();

    const channel = await db.query.channel.findFirst({
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelError();
    const { disabledAt, isApprovalRequired } = channel;

    const child = logger.child({ channel });
    child.info('channel for reply modal found');

    if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelError(disabledAt);

    if (isApprovalRequired) throw new ApprovalRequiredError();

    child.info('reply modal prompted');
    return {
        type: InteractionCallbackType.Modal,
        data: {
            custom_id: 'reply',
            title: 'Reply to a Message',
            components: [
                {
                    type: MessageComponentType.ActionRow,
                    components: [
                        {
                            custom_id: messageId.toString(),
                            type: MessageComponentType.TextInput,
                            style: MessageComponentTextInputStyle.Long,
                            required: true,
                            label: 'Reply',
                            placeholder: 'Hello...',
                        },
                    ],
                },
            ],
        },
    } satisfies InteractionCallbackModal;
}

export async function handleReplyModal(
    db: Database,
    logger: Logger,
    timestamp: Date,
    channelId: Snowflake,
    messageId: Snowflake,
    permissions: bigint,
) {
    try {
        return await renderReplyModal(db, logger, timestamp, channelId, messageId, permissions);
    } catch (err) {
        if (err instanceof ReplyModalError) {
            logger.error(err);
            return {
                type: InteractionCallbackType.ChannelMessageWithSource,
                data: { flags: MessageFlags.Ephemeral, content: err.message },
            } satisfies InteractionCallbackMessage;
        }
        throw err;
    }
}
