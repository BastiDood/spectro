import {
  type ConfessionChannelDestination,
  ConfessionDestinationType,
  type ConfessionThreadDestination,
  type ConfessionVoiceDestination,
  UnsupportedConfessionChannelError,
} from '#lib/server/interactions/confession-context.js';
import { createConfessionModal } from '#lib/server/confession/index.js';
import { hasAllFlags } from '#lib/bits.js';
import type { InteractionResponse } from '#lib/server/models/discord/interaction-response/index.js';
import { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.js';
import {
  MANAGE_THREADS,
  SEND_MESSAGES,
  SEND_MESSAGES_IN_THREADS,
} from '#lib/server/models/discord/permission.js';
import { MessageFlags } from '#lib/server/models/discord/message/base.js';
import type { Snowflake } from '#lib/server/models/discord/snowflake.js';
import { Tracer } from '#lib/server/telemetry/tracer.js';
import { UnreachableCodeError } from '#lib/server/assert.js';

const SERVICE_NAME = 'webhook.interaction.confess';
const tracer = Tracer.byName(SERVICE_NAME);

type ConfessionModalDestination =
  | Pick<ConfessionChannelDestination, 'channelId' | 'type'>
  | Pick<ConfessionThreadDestination, 'channelId' | 'isLocked' | 'threadId' | 'type'>
  | Pick<ConfessionVoiceDestination, 'channelId' | 'type'>;

export function handleConfess(
  destination: ConfessionModalDestination,
  authorId: Snowflake,
  permissions: bigint,
): InteractionResponse {
  try {
    return tracer.span('handle-confess', span => {
      span.setAttributes({
        'spectro.discord.channel.id': destination.channelId,
        'spectro.author.id': authorId,
      });

      let threadId: string | null = null;
      switch (destination.type) {
        case ConfessionDestinationType.Channel:
        case ConfessionDestinationType.Voice:
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
          span.setAttribute('spectro.discord.thread.id', threadId);
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
