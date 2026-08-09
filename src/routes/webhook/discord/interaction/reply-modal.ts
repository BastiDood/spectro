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
  constructor(
    public readonly channelId: Snowflake,
    public readonly targetChannelId: Snowflake,
  ) {
    super(`Reply channel ${channelId} does not match target channel ${targetChannelId}.`);
    this.name = 'ReplyChannelMismatchError';
  }

  static throwNew(channelId: Snowflake, targetChannelId: Snowflake): never {
    const error = new ReplyChannelMismatchError(channelId, targetChannelId);
    logger.error(
      error.message,
      'spectro.discord.interaction.reply_modal.channel_mismatch',
      {
        'spectro.discord.channel.id': error.channelId,
        'spectro.discord.target_channel.id': error.targetChannelId,
      },
      error,
    );
    throw error;
  }
}

const enum MissingReplyPermissionErrorType {
  SendMessages = 'send-messages',
  SendMessagesInThreads = 'send-messages-in-threads',
  ManageThreads = 'manage-threads',
}

class MissingReplyPermissionError extends ReplyModalError {
  constructor(
    public readonly type: MissingReplyPermissionErrorType,
    message: string,
  ) {
    super(`Permission failure ${type}: ${message}`);
    this.name = 'MissingReplyPermissionError';
  }

  static throwNew(type: MissingReplyPermissionErrorType, message: string): never {
    const error = new MissingReplyPermissionError(type, message);
    logger.error(
      error.message,
      'spectro.discord.interaction.reply_modal.permission_missing',
      { 'spectro.discord.permission.type': error.type },
      error,
    );
    throw error;
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
      'spectro.discord.channel.id': destination.channelId,
      'spectro.discord.message.id': messageId,
    });

    if (messageChannelId !== currentChannelId)
      ReplyChannelMismatchError.throwNew(currentChannelId, messageChannelId);

    switch (destination.type) {
      case ConfessionDestinationType.Channel:
        if (!hasAllFlags(permissions, SEND_MESSAGES))
          MissingReplyPermissionError.throwNew(
            MissingReplyPermissionErrorType.SendMessages,
            'You do not have permission to send anonymous replies in this channel.',
          );
        break;
      case ConfessionDestinationType.Thread:
        span.setAttribute('spectro.discord.thread.id', destination.threadId);
        if (!hasAllFlags(permissions, SEND_MESSAGES_IN_THREADS))
          MissingReplyPermissionError.throwNew(
            MissingReplyPermissionErrorType.SendMessagesInThreads,
            'You do not have permission to send anonymous replies in this thread.',
          );
        if (destination.isLocked && !hasAllFlags(permissions, MANAGE_THREADS))
          MissingReplyPermissionError.throwNew(
            MissingReplyPermissionErrorType.ManageThreads,
            'You do not have permission to reply anonymously in this locked thread.',
          );
        break;
      default:
        UnreachableCodeError.throwNew();
    }

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
    if (error instanceof ReplyModalError) {
      logger.warn(
        'Reply modal failure returned to the user',
        'spectro.discord.interaction.reply_modal.failure_recovered',
        void 0,
        error,
      );
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: error.message },
      } satisfies InteractionResponseMessage;
    }
    throw error;
  }
}
