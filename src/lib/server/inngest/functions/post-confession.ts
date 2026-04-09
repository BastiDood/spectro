import { NonRetriableError } from 'inngest';

import {
  ConfessionChannel,
  createConfessionPayload,
  getConfessionErrorMessage,
} from '$lib/server/confession';
import { DiscordClient } from '$lib/server/api/discord';
import { db, fetchConfessionForDispatch } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';
import { ConfessionSubmitEvent } from '$lib/server/inngest/schema';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import type { Message } from '$lib/server/models/discord/message';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.post-confession';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export const postConfession = inngest.createFunction(
  {
    id: 'discord/interaction.post',
    name: 'Post Confession to Channel',
    idempotency: 'event.data.interactionId',
    triggers: [ConfessionSubmitEvent],
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('post-confession-function', async span => {
      span.setAttributes({
        'inngest.event.id': event.id,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.internalId': event.data.internalId,
        'inngest.event.data.applicationId': event.data.applicationId,
        'inngest.event.data.interactionId': event.data.interactionId,
        'inngest.event.data.moderatorId': event.data.moderatorId,
      });

      const result = await step.run(
        { id: 'post-confession', name: 'Post Confession' },
        async () =>
          await tracer.asyncSpan('post-confession-step', async () => {
            // We refetch per step to avoid caching sensitive confessions in Inngest.
            const confession = await fetchConfessionForDispatch(db, BigInt(event.data.internalId));
            if (confession === null) {
              const error = new NonRetriableError('confession not found');
              logger.error('confession not found for post', error, {
                'confession.internal.id': event.data.internalId,
              });
              throw error;
            }

            if (confession.approvedAt === null) {
              logger.warn('confession pending approval, skipping post');
              return;
            }

            logger.debug('fetched confession', {
              'confession.created': confession.createdAt,
              'confession.approved': confession.approvedAt,
              'confession.id': confession.confessionId,
              'confession.channel.id': confession.channelId,
              'confession.parent.message.id': confession.parentMessageId,
            });

            // eslint-disable-next-line @typescript-eslint/init-declarations
            let message: Message;
            try {
              message = await DiscordClient.ENV.createMessage(
                confession.channelId,
                createConfessionPayload(confession),
                `${event.id}:post`,
              );
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.InvalidFormBody: {
                    const wrapped = new NonRetriableError(
                      'discord rejected createMessage nonce payload',
                      { cause: error },
                    );
                    logger.error('discord nonce validation failed in post-confession', wrapped, {
                      'inngest.event.id': event.id,
                      'discord.error.code': error.code,
                      'discord.error.message': error.message,
                    });
                    throw wrapped;
                  }
                  case DiscordErrorCode.UnknownChannel:
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Confession,
                      status: 'submitted',
                    });
                  default:
                    break; // might be a transient error?
                }
              throw error;
            }

            logger.info('confession published', {
              'discord.message.id': message.id,
              'discord.message.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });
          }),
      );

      if (result === null) return;

      await step.run(
        { id: 'send-failure-follow-up', name: 'Send Failure Follow-up' },
        async () =>
          await tracer.asyncSpan('send-failure-follow-up-step', async () => {
            try {
              const message = await DiscordClient.createFollowupMessage(
                event.data.applicationId,
                event.data.interactionToken,
                {
                  content: result,
                  flags: MessageFlags.Ephemeral,
                },
              );
              logger.info('failure follow-up sent', {
                'discord.message.id': message.id,
                'discord.message.channel.id': message.channel_id,
                'discord.message.timestamp': message.timestamp,
              });
            } catch (error) {
              logger.error(
                'failed to send failure follow-up',
                error instanceof Error ? error : void 0,
                {
                  'inngest.event.id': event.id,
                  'discord.application.id': event.data.applicationId,
                },
              );
              throw error;
            }
          }),
      );
    }),
);
