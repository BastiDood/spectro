import type { Logger } from 'pino';

import { db } from '$lib/server/database';

import type { InteractionResponseMessage } from '$lib/server/models/discord/interaction-response/message';
import type { InteractionResponseModal } from '$lib/server/models/discord/interaction-response/modal';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
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
async function renderReplyModal(
  logger: Logger,
  timestamp: Date,
  channelId: Snowflake,
  messageId: Snowflake,
) {
  const channel = await db.query.channel.findFirst({
    columns: { guildId: true, disabledAt: true, isApprovalRequired: true },
    where({ id }, { eq }) {
      return eq(id, channelId);
    },
  });

  if (typeof channel === 'undefined') throw new UnknownChannelReplyModalError();
  const { disabledAt, isApprovalRequired } = channel;

  logger.info({ channel }, 'channel for reply modal found');

  if (disabledAt !== null && disabledAt <= timestamp)
    throw new DisabledChannelReplyModalError(disabledAt);
  if (isApprovalRequired) throw new ApprovalRequiredReplyModalError();

  logger.info('reply modal prompted');
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
  } satisfies InteractionResponseModal;
}

export async function handleReplyModal(
  logger: Logger,
  timestamp: Date,
  channelId: Snowflake,
  messageId: Snowflake,
) {
  try {
    return await renderReplyModal(logger, timestamp, channelId, messageId);
  } catch (err) {
    if (err instanceof ReplyModalError) {
      logger.error(err, err.message);
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: err.message },
      } satisfies InteractionResponseMessage;
    }
    throw err;
  }
}
