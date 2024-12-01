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

class ConfessionNotFoundError extends ReplyModalError {
    constructor() {
        super('This message is not associated to any known confessions.');
        this.name = 'ConfessionNotFoundError';
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
 * @throws {ConfessionNotFoundError}
 * @throws {DisabledChannelError}
 * @throws {ApprovalRequiredError}
 */
async function renderReplyModal(db: Database, timestamp: Date, messageId: Snowflake) {
    const found = await db.query.publication.findFirst({
        columns: {},
        with: {
            confession: {
                with: { channel: { columns: { label: true, disabledAt: true, isApprovalRequired: true } } },
                columns: { confessionId: true },
            },
        },
        where(table, { eq }) {
            return eq(table.messageId, messageId);
        },
    });

    if (typeof found === 'undefined') throw new ConfessionNotFoundError();
    const {
        confession: {
            confessionId,
            channel: { disabledAt, isApprovalRequired, label },
        },
    } = found;

    if (disabledAt !== null && disabledAt <= timestamp) throw new DisabledChannelError(disabledAt);

    // TODO: Somehow keep track of which confession is being replied to rather than just failing here.
    if (isApprovalRequired) throw new ApprovalRequiredError();

    return {
        type: InteractionCallbackType.Modal,
        data: {
            custom_id: messageId.toString(),
            title: `Replying to ${label} #${confessionId}`,
            components: [
                {
                    type: MessageComponentType.ActionRow,
                    components: [
                        {
                            custom_id: confessionId.toString(),
                            type: MessageComponentType.TextInput,
                            style: MessageComponentTextInputStyle.Long,
                            required: true,
                            label: 'Reply',
                            placeholder: `Hi ${label} #${confessionId}...`,
                        },
                    ],
                },
            ],
        },
    } satisfies InteractionCallbackModal;
}

export async function handleReplyModal(db: Database, timestamp: Date, messageId: Snowflake) {
    try {
        return await renderReplyModal(db, timestamp, messageId);
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
