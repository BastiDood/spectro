import { NonRetriableError } from 'inngest';

import { UnreachableCodeError } from '$lib/assert';
import {
  ConfessionChannel,
  createConfessionPayload,
  getConfessionErrorMessage,
} from '$lib/server/confession';
import { DiscordClient } from '$lib/server/api/discord';
import { db, fetchConfessionForDispatch } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import type { Message } from '$lib/server/models/discord/message';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.post-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const enum Result {
  Success = 'Success',
  Pending = 'Pending',
  Failure = 'Failure',
}

interface Success {
  type: Result.Success;
  confessionId: string;
  channelLabel: string;
}

interface Pending {
  type: Result.Pending;
  confessionId: string;
  channelLabel: string;
}

interface Failure {
  type: Result.Failure;
  message: string;
}

export const postConfession = inngest.createFunction(
  { id: 'discord/interaction.post', name: 'Post Confession to Channel' },
  { event: 'discord/confession.submit' },
  async ({ event, step }) =>
    await tracer.asyncSpan('post-confession-function', async span => {
      span.setAttribute('confession', event.data.internalId);
      if (typeof event.data.moderatorId !== 'undefined')
        span.setAttribute('confession.moderator.id', event.data.moderatorId);

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
              return {
                type: Result.Pending,
                confessionId: confession.confessionId,
                channelLabel: confession.channel.label,
              } as Pending;
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
              );
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.UnknownChannel:
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return {
                      type: Result.Failure,
                      message: getConfessionErrorMessage(error.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Confession,
                        status: 'submitted',
                      }),
                    } as Failure;
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

            return {
              type: Result.Success,
              confessionId: confession.confessionId,
              channelLabel: confession.channel.label,
            } as Success;
          }),
      );

      await step.run(
        { id: 'send-acknowledgement', name: 'Send Acknowledgement' },
        async () =>
          await tracer.asyncSpan('send-acknowledgement-step', async () => {
            switch (result.type) {
              case Result.Success:
                await DiscordClient.ENV.deleteOriginalResponse(
                  event.data.applicationId,
                  event.data.interactionToken,
                );
                logger.info('original response deleted');
                break;
              case Result.Pending: {
                const acknowledgement = `Your confession (${result.channelLabel} #${result.confessionId}) has been submitted and is pending moderator approval.`;
                const message = await DiscordClient.ENV.editOriginalResponse(
                  event.data.applicationId,
                  event.data.interactionToken,
                  acknowledgement,
                );
                logger.info('acknowledgement sent', {
                  'discord.message.id': message.id,
                  'discord.message.channel.id': message.channel_id,
                  'discord.message.timestamp': message.timestamp,
                });
                break;
              }
              case Result.Failure: {
                const message = await DiscordClient.ENV.editOriginalResponse(
                  event.data.applicationId,
                  event.data.interactionToken,
                  result.message,
                );
                logger.info('failure acknowledgement sent', {
                  'discord.message.id': message.id,
                  'discord.message.channel.id': message.channel_id,
                  'discord.message.timestamp': message.timestamp,
                });
                break;
              }
              default:
                UnreachableCodeError.throwNew();
            }
          }),
      );
    }),
);
