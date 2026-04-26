import assert, { strictEqual } from 'node:assert/strict';

import { inngest } from '$lib/server/inngest/client';
import { ChannelSetupEvent } from '$lib/server/inngest/functions/process-channel-setup/schema';
import { ChannelType } from '$lib/server/models/discord/channel';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Resolved } from '$lib/server/models/discord/resolved';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { UnexpectedSetupArgumentError, UnexpectedSetupOptionTypeError } from './errors';

const SERVICE_NAME = 'webhook.interaction.setup';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export async function handleSetup(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
  resolvedChannels: NonNullable<Resolved['channels']>,
  guildId: Snowflake,
  channelId: Snowflake,
  moderatorId: Snowflake,
  options: InteractionApplicationCommandChatInputOption[],
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-setup', async span => {
    span.setAttributes({
      'guild.id': guildId,
      'channel.id': channelId,
      'moderator.id': moderatorId,
    });

    let logChannelId: Snowflake | null = null;
    let label: string | null = null;
    let color: string | null = null;
    let isApprovalRequired: boolean | null = null;

    for (const option of options)
      switch (option.type) {
        case InteractionApplicationCommandChatInputOptionType.Channel:
          logChannelId = option.value;
          break;
        case InteractionApplicationCommandChatInputOptionType.String:
          switch (option.name) {
            case 'label':
              label = option.value;
              break;
            case 'color':
              color = option.value;
              break;
            default:
              UnexpectedSetupArgumentError.throwNew(option.name);
          }
          break;
        case InteractionApplicationCommandChatInputOptionType.Boolean:
          strictEqual(option.name, 'approval');
          isApprovalRequired = option.value;
          break;
        default:
          UnexpectedSetupOptionTypeError.throwNew(option.type);
      }

    assert(logChannelId !== null);

    const logChannel = resolvedChannels[logChannelId];
    assert(typeof logChannel !== 'undefined');
    strictEqual(logChannel.type, ChannelType.GuildText);
    span.setAttribute('log.channel.id', logChannelId);

    const { ids } = await inngest.send(
      ChannelSetupEvent.create(
        {
          applicationId,
          interactionId,
          interactionToken,
          guildId,
          channelId,
          logChannelId,
          label,
          color,
          isApprovalRequired,
        },
        { id: interactionId, ts: timestamp.valueOf() },
      ),
    );

    logger.debug('channel setup queued', { 'inngest.events.id': ids });

    return {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    };
  });
}
