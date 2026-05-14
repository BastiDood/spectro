import { createConfessionModal } from '$lib/server/confession';
import { hasAllFlags } from '$lib/bits';
import type { InteractionResponseMessage } from '$lib/server/models/discord/interaction-response/message';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { Logger } from '$lib/server/telemetry/logger';
import {
  MANAGE_THREADS,
  SEND_MESSAGES,
  SEND_MESSAGES_IN_THREADS,
} from '$lib/server/models/discord/permission';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';
import { UnreachableCodeError } from '$lib/assert';

import {
  type ConfessionChannelDestination,
  ConfessionDestinationType,
  type ConfessionThreadDestination,
} from './channel-context';

const SERVICE_NAME = 'webhook.interaction.reply-modal';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

type ReplyModalDestination =
  | Pick<ConfessionChannelDestination, 'channelId' | 'type'>
  | Pick<ConfessionThreadDestination, 'channelId' | 'isLocked' | 'threadId' | 'type'>;

abstract class ReplyModalError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ReplyError';
  }
}

class ReplyChannelMismatchError extends ReplyModalError {
  constructor() {
    super('Spectro cannot determine the target channel for this anonymous reply.');
    this.name = 'ReplyChannelMismatchError';
  }

  static throwNew(channelId: Snowflake, targetChannelId: Snowflake): never {
    const error = new ReplyChannelMismatchError();
    logger.fatal('reply target channel mismatch', error, {
      'channel.id': channelId,
      'target.channel.id': targetChannelId,
    });
    throw error;
  }
}

class MissingReplyPermissionError extends ReplyModalError {
  constructor(message: string) {
    super(message);
    this.name = 'MissingReplyPermissionError';
  }
}

/** @throws {ReplyChannelMismatchError} */
function renderReplyModal(
  destination: ReplyModalDestination,
  currentChannelId: Snowflake,
  messageId: Snowflake,
  messageChannelId: Snowflake,
  permissions: bigint,
) {
  return tracer.span('render-reply-modal', span => {
    span.setAttributes({
      'channel.id': destination.channelId,
      'message.id': messageId,
    });

    if (messageChannelId !== currentChannelId)
      ReplyChannelMismatchError.throwNew(currentChannelId, messageChannelId);

    switch (destination.type) {
      case ConfessionDestinationType.Channel:
        if (!hasAllFlags(permissions, SEND_MESSAGES))
          throw new MissingReplyPermissionError(
            'You do not have permission to send anonymous replies in this channel.',
          );
        break;
      case ConfessionDestinationType.Thread:
        span.setAttribute('thread.id', destination.threadId);
        if (!hasAllFlags(permissions, SEND_MESSAGES_IN_THREADS))
          throw new MissingReplyPermissionError(
            'You do not have permission to send anonymous replies in this thread.',
          );
        if (destination.isLocked && !hasAllFlags(permissions, MANAGE_THREADS))
          throw new MissingReplyPermissionError(
            'You do not have permission to reply anonymously in this locked thread.',
          );
        break;
      default:
        UnreachableCodeError.throwNew();
    }

    logger.debug('reply modal prompted');
    return createConfessionModal({
      channelId: destination.channelId,
      threadId: destination.type === ConfessionDestinationType.Thread ? destination.threadId : null,
      parentMessageId: messageId,
    });
  });
}

export function handleReplyModal(
  destination: ReplyModalDestination,
  currentChannelId: Snowflake,
  messageId: Snowflake,
  messageChannelId: Snowflake,
  permissions: bigint,
) {
  try {
    return renderReplyModal(
      destination,
      currentChannelId,
      messageId,
      messageChannelId,
      permissions,
    );
  } catch (error) {
    if (error instanceof ReplyModalError)
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: error.message },
      } satisfies InteractionResponseMessage;
    throw error;
  }
}
