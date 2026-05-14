import { createConfessionModal } from '$lib/server/confession';
import { hasAllFlags } from '$lib/bits';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
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
  UnsupportedConfessionChannelError,
} from './channel-context';

const SERVICE_NAME = 'webhook.interaction.confess';
const tracer = Tracer.byName(SERVICE_NAME);

type ConfessionModalDestination =
  | Pick<ConfessionChannelDestination, 'channelId' | 'type'>
  | Pick<ConfessionThreadDestination, 'channelId' | 'isLocked' | 'threadId' | 'type'>;

export function handleConfess(
  destination: ConfessionModalDestination,
  authorId: Snowflake,
  permissions: bigint,
): InteractionResponse {
  try {
    return tracer.span('handle-confess', span => {
      span.setAttributes({
        'channel.id': destination.channelId,
        'author.id': authorId,
      });

      let threadId: string | null = null;
      switch (destination.type) {
        case ConfessionDestinationType.Channel:
          if (!hasAllFlags(permissions, SEND_MESSAGES))
            return {
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                flags: MessageFlags.Ephemeral,
                content: 'You do not have permission to send confessions in this channel.',
              },
            };
          break;
        case ConfessionDestinationType.Thread:
          ({ threadId } = destination);
          span.setAttribute('thread.id', threadId);
          if (!hasAllFlags(permissions, SEND_MESSAGES_IN_THREADS))
            return {
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                flags: MessageFlags.Ephemeral,
                content: 'You do not have permission to send confessions in this thread.',
              },
            };
          if (destination.isLocked && !hasAllFlags(permissions, MANAGE_THREADS))
            return {
              type: InteractionResponseType.ChannelMessageWithSource,
              data: {
                flags: MessageFlags.Ephemeral,
                content: 'You do not have permission to post anonymously in this locked thread.',
              },
            };
          break;
        default:
          UnreachableCodeError.throwNew();
      }

      return createConfessionModal({
        channelId: destination.channelId,
        threadId,
        parentMessageId: null,
      });
    });
  } catch (error) {
    if (error instanceof UnsupportedConfessionChannelError)
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: error.message },
      };
    throw error;
  }
}
