import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { db } from '$lib/server/database';

import type { InteractionResponseMessage } from '$lib/server/models/discord/interaction-response/message';
import type { InteractionResponseModal } from '$lib/server/models/discord/interaction-response/modal';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

const SERVICE_NAME = 'webhook.interaction.reply-modal';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

abstract class ReplyModalError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ReplyError';
  }
}

class UnknownChannelReplyModalError extends ReplyModalError {
  constructor() {
    super('This channel has not been set up for confessions yet.');
    this.name = 'UnknownChannelReplyModalError';
  }
}

class DisabledChannelReplyModalError extends ReplyModalError {
  constructor(public disabledAt: Date) {
    const timestamp = Math.floor(disabledAt.valueOf() / 1000);
    super(
      `This channel has temporarily disabled confessions (including replies) since <t:${timestamp}:R>.`,
    );
    this.name = 'DisabledChannelReplyModalError';
  }
}

class ApprovalRequiredReplyModalError extends ReplyModalError {
  constructor() {
    super('You cannot (yet) reply to a confession in a channel that requires moderator approval.');
    this.name = 'ApprovalRequiredReplyModalError';
  }
}

/**
 * @throws {UnknownChannelReplyModalError}
 * @throws {DisabledChannelReplyModalError}
 * @throws {ApprovalRequiredReplyModalError}
 */
async function renderReplyModal(timestamp: Date, channelId: Snowflake, messageId: Snowflake) {
  return await tracer.asyncSpan('render-reply-modal', async span => {
    span.setAttributes({
      'channel.id': channelId,
      'message.id': messageId,
    });

    const channel = await db.query.channel.findFirst({
      columns: { guildId: true, disabledAt: true, isApprovalRequired: true },
      where({ id }, { eq }) {
        return eq(id, BigInt(channelId));
      },
    });

    if (typeof channel === 'undefined') {
      const error = new UnknownChannelReplyModalError();
      logger.error('unknown channel for reply modal', error);
      throw error;
    }

    const { disabledAt, isApprovalRequired } = channel;

    logger.debug('channel found', {
      'guild.id': channel.guildId.toString(),
      'approval.required': channel.isApprovalRequired,
    });

    if (disabledAt !== null && disabledAt <= timestamp) {
      logger.warn('channel disabled for reply modal', {
        'disabled.at': disabledAt.toISOString(),
      });
      throw new DisabledChannelReplyModalError(disabledAt);
    }
    if (isApprovalRequired) {
      logger.warn('approval required for reply modal');
      throw new ApprovalRequiredReplyModalError();
    }

    logger.debug('reply modal prompted');
    return {
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'reply',
        title: 'Reply to a Message',
        components: [
          {
            type: MessageComponentType.ActionRow,
            components: [
              {
                custom_id: messageId,
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
    } satisfies InteractionResponseModal;
  });
}

export async function handleReplyModal(
  timestamp: Date,
  channelId: Snowflake,
  messageId: Snowflake,
) {
  try {
    return await renderReplyModal(timestamp, channelId, messageId);
  } catch (err) {
    if (err instanceof ReplyModalError) {
      logger.error(err.message, err);
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: err.message },
      } satisfies InteractionResponseMessage;
    }
    throw err;
  }
}
