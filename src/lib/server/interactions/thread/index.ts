import {
  type ConfessionDestination,
  ConfessionDestinationType,
} from '$lib/server/interactions/confession-context';
import {
  CREATE_PUBLIC_THREADS,
  SEND_MESSAGES_IN_THREADS,
} from '$lib/server/models/discord/permission';
import { createThreadConfessionModal } from '$lib/server/confession';
import { hasAllFlags } from '$lib/bits';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';
import { UnreachableCodeError } from '$lib/server/assert';

const SERVICE_NAME = 'webhook.interaction.thread';
const tracer = Tracer.byName(SERVICE_NAME);

export function handleThread(
  destination: Pick<ConfessionDestination, 'channelId' | 'type'>,
  authorId: Snowflake,
  permissions: bigint,
): InteractionResponse {
  return tracer.span('handle-thread', span => {
    span.setAttributes({
      'spectro.discord.channel.id': destination.channelId,
      'spectro.author.id': authorId,
    });

    switch (destination.type) {
      case ConfessionDestinationType.Channel:
        break;
      case ConfessionDestinationType.Thread:
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: 'Use `/confess` to post anonymously inside this thread.',
          },
        };
      case ConfessionDestinationType.Voice:
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.Ephemeral,
            content: 'Anonymous threads are not supported in voice channels.',
          },
        };
      default:
        UnreachableCodeError.throwNew();
    }

    if (!hasAllFlags(permissions, CREATE_PUBLIC_THREADS))
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
          content: 'You do not have permission to create public threads in this channel.',
        },
      };

    if (!hasAllFlags(permissions, SEND_MESSAGES_IN_THREADS))
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
          content: 'You do not have permission to send messages in threads.',
        },
      };

    return createThreadConfessionModal(destination.channelId);
  });
}
