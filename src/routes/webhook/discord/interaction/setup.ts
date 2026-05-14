import assert, { strictEqual } from 'node:assert/strict';

import { type Channel, ChannelType } from '$lib/server/models/discord/channel';
import { ChannelSetupEvent } from '$lib/server/inngest/functions/process-channel-setup/schema';
import { inngest } from '$lib/server/inngest/client';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
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
  resolvedChannels: Record<string, Pick<Channel, 'type'>>,
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
    let targetChannelId: Snowflake | null = null;
    let label: string | null = null;
    let color: string | null = null;
    let isApprovalRequired: boolean | null = null;

    for (const option of options)
      switch (option.type) {
        case InteractionApplicationCommandChatInputOptionType.Channel:
          switch (option.name) {
            case 'log-channel':
              logChannelId = option.value;
              break;
            case 'confession-channel':
              targetChannelId = option.value;
              break;
            default:
              UnexpectedSetupArgumentError.throwNew(option.name);
          }
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
    const effectiveTargetChannelId = targetChannelId ?? channelId;

    const logChannel = resolvedChannels[logChannelId];
    assert(typeof logChannel !== 'undefined');
    strictEqual(logChannel.type, ChannelType.GuildText);

    if (targetChannelId !== null) span.setAttribute('target.channel.id', targetChannelId);
    span.setAttributes({
      'log.channel.id': logChannelId,
      'effective.channel.id': effectiveTargetChannelId,
    });

    const { ids } = await inngest.send(
      ChannelSetupEvent.create(
        {
          applicationId,
          interactionId,
          interactionToken,
          guildId,
          channelId,
          targetChannelId: effectiveTargetChannelId,
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
