import { NonRetriableError } from 'inngest';

import { UnreachableCodeError } from '$lib/assert';
import {
  ConfessionChannel,
  createLogPayload,
  getConfessionErrorMessage,
  type LogPayloadMode,
  LogPayloadType,
} from '$lib/server/confession';
import { DiscordClient } from '$lib/server/api/discord';
import { db, fetchConfessionForLog, resetLogChannel } from '$lib/server/database';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { inngest } from '$lib/server/inngest/client';
import type { Message } from '$lib/server/models/discord/message';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.log-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const enum Result {
  Success = 'success',
  MissingChannel = 'missing-channel',
  Failure = 'failure',
}

interface Success {
  type: Result.Success;
}

interface MissingChannel {
  type: Result.MissingChannel;
  channelLabel: string;
  confessionId: string;
}

interface Failure {
  type: Result.Failure;
  message: string;
}

export const logConfession = inngest.createFunction(
  {
    id: 'discord/interaction.log',
    name: 'Log Confession',
    idempotency: 'event.data.interactionId',
  },
  { event: 'discord/confession.submit' },
  async ({ event, step }) =>
    await tracer.asyncSpan('log-confession-function', async span => {
      span.setAttribute('confession.internal.id', event.data.internalId);

      const result = await step.run(
        { id: 'log-confession', name: 'Log Confession' },
        async () =>
          await tracer.asyncSpan('log-confession-step', async () => {
            // We refetch per step to avoid caching sensitive confessions in Inngest.
            const confession = await fetchConfessionForLog(db, BigInt(event.data.internalId));
            if (confession === null) {
              const error = new NonRetriableError('confession not found');
              logger.error('confession not found for log', error, {
                'confession.internal.id': event.data.internalId,
              });
              throw error;
            }

            if (confession.channel.logChannelId === null) {
              logger.warn('no log channel configured');
              return {
                type: Result.MissingChannel,
                channelLabel: confession.channel.label,
                confessionId: confession.confessionId,
              } as MissingChannel;
            }

            logger.debug('fetched confession', {
              'confession.created': confession.createdAt,
              'confession.approved': confession.approvedAt,
              'confession.id': confession.confessionId,
              'confession.channel.id': confession.channelId,
            });

            const mode: LogPayloadMode =
              // eslint-disable-next-line no-nested-ternary
              typeof event.data.moderatorId === 'undefined'
                ? confession.channel.isApprovalRequired
                  ? { type: LogPayloadType.Pending, internalId: BigInt(confession.internalId) }
                  : { type: LogPayloadType.Approved }
                : { type: LogPayloadType.Resent, moderatorId: BigInt(event.data.moderatorId) };

            // eslint-disable-next-line @typescript-eslint/init-declarations
            let message: Message;
            try {
              message = await DiscordClient.ENV.createMessage(
                confession.channel.logChannelId,
                createLogPayload(confession, mode),
              );
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.UnknownChannel:
                    await resetLogChannel(db, BigInt(confession.channelId));
                    logger.warn('log channel reset');
                  // fall through to return failure
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return {
                      type: Result.Failure,
                      message: getConfessionErrorMessage(error.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Log,
                        status:
                          // eslint-disable-next-line no-nested-ternary
                          typeof event.data.moderatorId === 'undefined'
                            ? confession.channel.isApprovalRequired
                              ? 'submitted, but its publication is pending approval'
                              : 'published'
                            : 'resent',
                      }),
                    } as Failure;
                  default:
                    break;
                }
              throw error;
            }

            logger.trace('confession logged', {
              'discord.message.id': message.id,
              'discord.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });

            return { type: Result.Success } as Success;
          }),
      );

      switch (result.type) {
        case Result.Success:
          break; // silent logging on success
        case Result.MissingChannel:
          await step.run(
            { id: 'send-missing-channel', name: 'Send Missing Channel Message' },
            async () =>
              await tracer.asyncSpan('send-missing-channel-step', async () => {
                const message = await DiscordClient.ENV.editOriginalResponse(
                  event.data.applicationId,
                  event.data.interactionToken,
                  `Spectro has received your confession, but the moderators have not yet configured a channel for logging confessions. Kindly remind the server moderators to set up the logging channel and ask them resend your confession: ${result.channelLabel} #${result.confessionId}.`,
                );
                logger.info('missing channel message sent', {
                  'discord.message.id': message.id,
                  'discord.message.channel.id': message.channel_id,
                  'discord.message.timestamp': message.timestamp,
                });
              }),
          );
          break;
        case Result.Failure:
          await step.run(
            { id: 'send-failure', name: 'Send Failure Message' },
            async () =>
              await tracer.asyncSpan('send-failure-step', async () => {
                const message = await DiscordClient.ENV.editOriginalResponse(
                  event.data.applicationId,
                  event.data.interactionToken,
                  result.message,
                );
                logger.info('failure message sent', {
                  'discord.message.id': message.id,
                  'discord.message.channel.id': message.channel_id,
                  'discord.message.timestamp': message.timestamp,
                });
              }),
          );
          break;
        default:
          UnreachableCodeError.throwNew();
      }
    }),
);
