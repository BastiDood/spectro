import { NonRetriableError } from 'inngest';

import { db, disableConfessionChannel } from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ChannelLockdownEvent } from './schema';

const SERVICE_NAME = 'inngest.process-channel-lockdown';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export const processChannelLockdown = inngest.createFunction(
  {
    id: 'discord/interaction.process-channel-lockdown',
    name: 'Process Channel Lockdown',
    triggers: ChannelLockdownEvent,
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('process-channel-lockdown-function', async span => {
      const { data } = event;
      const { applicationId, interactionToken } = data;

      span.setAttributes({
        'spectro.inngest.event.id': event.id,
        'spectro.inngest.event.name': event.name,
        'spectro.inngest.event.timestamp': event.ts,
        'spectro.channel.id': data.channelId,
      });

      const content = await step.run(
        { id: 'process-lockdown', name: 'Process Lockdown' },
        async () => {
          const disabled = await disableConfessionChannel(
            db,
            BigInt(data.channelId),
            new Date(event.ts),
          );

          if (!disabled) return 'This has not yet been set up for confessions.';

          logger.info(
            'Confessions disabled',
            'spectro.inngest.channel_lockdown.confessions_disabled',
          );
          return 'Confessions have been temporarily disabled for this channel.';
        },
      );

      await step.run(
        { id: 'edit-original-interaction-response', name: 'Edit Original Interaction Response' },
        async () => {
          try {
            await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
              content,
            });
          } catch (cause) {
            if (cause instanceof DiscordError)
              switch (cause.code) {
                case DiscordErrorCode.UnknownWebhook:
                case DiscordErrorCode.InvalidWebhookToken: {
                  const wrapped = new NonRetriableError(
                    'discord rejected original interaction response edit',
                    { cause },
                  );
                  logger.error(
                    'Discord rejected original interaction response edit',
                    'spectro.inngest.channel_lockdown.interaction_response_exception',
                    { 'spectro.discord.error.code': cause.code },
                    wrapped,
                  );
                  throw wrapped;
                }
                default:
                  break;
              }
            throw cause;
          }
        },
      );
      span.setAttribute('spectro.discord.interaction_response.edited', true);
    }),
);
