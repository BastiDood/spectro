import {
  CREATE_PUBLIC_THREADS,
  SEND_MESSAGES,
  SEND_MESSAGES_IN_THREADS,
} from '$lib/server/models/discord/permission';
import { createThreadReplyConfessionModal } from '$lib/server/confession';
import { hasAllFlags } from '$lib/bits';
import type { InteractionResponseMessage } from '$lib/server/models/discord/interaction-response/message';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';
import { UnreachableCodeError } from '$lib/assert';

import {
  type ConfessionChannelDestination,
  ConfessionDestinationType,
  type ConfessionThreadDestination,
} from './channel-context';

const SERVICE_NAME = 'webhook.interaction.thread-reply-modal';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

type ThreadReplyModalDestination =
  | Pick<ConfessionChannelDestination, 'channelId' | 'type'>
  | Pick<ConfessionThreadDestination, 'channelId' | 'threadId' | 'type'>;

abstract class ThreadReplyModalError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ThreadReplyError';
  }
}

class ThreadReplyChannelMismatchError extends ThreadReplyModalError {
  constructor(
    public readonly channelId: Snowflake,
    public readonly targetChannelId: Snowflake,
  ) {
    super(`Thread reply channel ${channelId} does not match target channel ${targetChannelId}.`);
    this.name = 'ThreadReplyChannelMismatchError';
  }

  static throwNew(channelId: Snowflake, targetChannelId: Snowflake): never {
    const error = new ThreadReplyChannelMismatchError(channelId, targetChannelId);
    logger.error(
      error.message,
      'spectro.discord.interaction.thread_reply_modal.channel_mismatch',
      {
        'spectro.discord.channel.id': error.channelId,
        'spectro.discord.target_channel.id': error.targetChannelId,
      },
      error,
    );
    throw error;
  }
}

const enum MissingThreadReplyPermissionErrorType {
  SendMessages = 'send-messages',
  CreatePublicThreads = 'create-public-threads',
  SendMessagesInThreads = 'send-messages-in-threads',
}

class MissingThreadReplyPermissionError extends ThreadReplyModalError {
  constructor(
    public readonly type: MissingThreadReplyPermissionErrorType,
    message: string,
  ) {
    super(`Permission failure ${type}: ${message}`);
    this.name = 'MissingThreadReplyPermissionError';
  }

  static throwNew(type: MissingThreadReplyPermissionErrorType): never {
    let message: string;
    switch (type) {
      case MissingThreadReplyPermissionErrorType.SendMessages:
        message = 'You do not have permission to send anonymous replies in this channel.';
        break;
      case MissingThreadReplyPermissionErrorType.CreatePublicThreads:
        message = 'You do not have permission to create public threads in this channel.';
        break;
      case MissingThreadReplyPermissionErrorType.SendMessagesInThreads:
        message = 'You do not have permission to send messages in threads.';
        break;
      default:
        UnreachableCodeError.throwNew();
    }
    const error = new MissingThreadReplyPermissionError(type, message);
    logger.error(
      error.message,
      'spectro.discord.interaction.thread_reply_modal.permission_missing',
      { 'spectro.discord.permission.type': error.type },
      error,
    );
    throw error;
  }
}

class RecursiveThreadReplyError extends ThreadReplyModalError {
  constructor() {
    super('Use `/confess` to post anonymously inside this thread.');
    this.name = 'RecursiveThreadReplyError';
  }

  static throwNew(): never {
    const error = new RecursiveThreadReplyError();
    logger.error(
      error.message,
      'spectro.discord.interaction.thread_reply_modal.recursive',
      void 0,
      error,
    );
    throw error;
  }
}

function renderThreadReplyModal(
  destination: ThreadReplyModalDestination,
  currentChannelId: Snowflake,
  messageId: Snowflake,
  messageChannelId: Snowflake,
  permissions: bigint,
) {
  return tracer.span('render-thread-reply-modal', span => {
    span.setAttributes({
      'spectro.discord.channel.id': destination.channelId,
      'spectro.discord.message.id': messageId,
    });

    if (destination.type === ConfessionDestinationType.Thread) {
      span.setAttribute('spectro.discord.thread.id', destination.threadId);
      RecursiveThreadReplyError.throwNew();
    }

    if (messageChannelId !== currentChannelId)
      ThreadReplyChannelMismatchError.throwNew(currentChannelId, messageChannelId);

    if (!hasAllFlags(permissions, SEND_MESSAGES))
      MissingThreadReplyPermissionError.throwNew(
        MissingThreadReplyPermissionErrorType.SendMessages,
      );
    if (!hasAllFlags(permissions, CREATE_PUBLIC_THREADS))
      MissingThreadReplyPermissionError.throwNew(
        MissingThreadReplyPermissionErrorType.CreatePublicThreads,
      );
    if (!hasAllFlags(permissions, SEND_MESSAGES_IN_THREADS))
      MissingThreadReplyPermissionError.throwNew(
        MissingThreadReplyPermissionErrorType.SendMessagesInThreads,
      );

    return createThreadReplyConfessionModal(destination.channelId, messageId);
  });
}

export function handleThreadReplyModal(
  destination: ThreadReplyModalDestination,
  currentChannelId: Snowflake,
  messageId: Snowflake,
  messageChannelId: Snowflake,
  permissions: bigint,
) {
  try {
    return renderThreadReplyModal(
      destination,
      currentChannelId,
      messageId,
      messageChannelId,
      permissions,
    );
  } catch (error) {
    if (error instanceof ThreadReplyModalError) {
      logger.warn(
        'Thread reply modal failure returned to the user',
        'spectro.discord.interaction.thread_reply_modal.failure_recovered',
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
