import {
  type ConfessionDestination,
  ConfessionDestinationType,
} from '#lib/server/interactions/confession-context.ts';
import {
  CREATE_PUBLIC_THREADS,
  SEND_MESSAGES_IN_THREADS,
} from '#lib/server/models/discord/permission.ts';
import { createThreadConfessionModal } from '#lib/server/confession/index.ts';
import { hasAllFlags } from '#lib/bits.ts';
import type { InteractionResponse } from '#lib/server/models/discord/interaction-response/index.ts';
import { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.ts';
import { MessageFlags } from '#lib/server/models/discord/message/base.ts';
import type { Snowflake } from '#lib/server/models/discord/snowflake.ts';
import { Tracer } from '#lib/server/telemetry/tracer.ts';

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
