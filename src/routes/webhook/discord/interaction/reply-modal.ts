import type { Database } from '$lib/server/database';
import type { InteractionCallbackMessage } from '$lib/server/models/discord/interaction-callback/message';
import type { InteractionCallbackModal } from '$lib/server/models/discord/interaction-callback/modal';
import { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

abstract class ReplyModalError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'ReplyError';
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
 * @throws {UnknownChannelError}
 * @throws {DisabledChannelError}
 * @throws {ApprovalRequiredError}
 */
async function renderReplyModal(db: Database, timestamp: Date, channelId: Snowflake, messageId: Snowflake) {
    const channel = await db.query.channel.findFirst({
        columns: { guildId: true, disabledAt: true, isApprovalRequired: true },
        where({ id }, { eq }) {
            return eq(id, channelId);
        },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelError();

    const { disabledAt, isApprovalRequired } = channel;
    if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelError(disabledAt);
    if (isApprovalRequired) throw new ApprovalRequiredError();

    return {
        type: InteractionCallbackType.Modal,
        data: {
            custom_id: messageId.toString(),
            title: 'Reply to a Message',
            components: [
                {
                    type: MessageComponentType.ActionRow,
                    components: [
                        {
                            custom_id: channelId.toString(),
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

export async function handleReplyModal(db: Database, timestamp: Date, channelId: Snowflake, messageId: Snowflake) {
    try {
        return await renderReplyModal(db, timestamp, channelId, messageId);
    } catch (err) {
        if (err instanceof ReplyModalError) {
            console.error(err);
            return {
                type: InteractionCallbackType.ChannelMessageWithSource,
                data: { flags: MessageFlags.Ephemeral, content: err.message },
            } satisfies InteractionCallbackMessage;
        }
        throw err;
    }
}
