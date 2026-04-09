import { NonRetriableError } from 'inngest';

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
import { ConfessionSubmitEvent } from '$lib/server/inngest/schema';
import type { Message } from '$lib/server/models/discord/message';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.log-confession';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export const logConfession = inngest.createFunction(
  {
    id: 'discord/interaction.log',
    name: 'Log Confession',
    idempotency: 'event.data.interactionId',
    triggers: [ConfessionSubmitEvent],
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('log-confession-function', async span => {
      span.setAttributes({
        'inngest.event.id': event.id,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.internalId': event.data.internalId,
        'inngest.event.data.applicationId': event.data.applicationId,
        'inngest.event.data.interactionId': event.data.interactionId,
      });

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
              return `Spectro has received your confession, but the moderators have not yet configured a channel for logging confessions. Kindly remind the server moderators to set up the logging channel and ask them resend your confession: **${confession.channel.label} #${confession.confessionId}**.`;
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
                `${event.id}:log`,
              );
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.InvalidFormBody: {
                    const wrapped = new NonRetriableError(
                      'discord rejected createMessage nonce payload',
                      { cause: error },
                    );
                    logger.error('discord nonce validation failed in log-confession', wrapped, {
                      'inngest.event.id': event.id,
                      'discord.error.code': error.code,
                      'discord.error.message': error.message,
                    });
                    throw wrapped;
                  }
                  case DiscordErrorCode.UnknownChannel:
                    await resetLogChannel(db, BigInt(confession.channelId));
                    logger.warn('log channel reset');
                  // fall through to return failure
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return getConfessionErrorMessage(error.code, {
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
                    });
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
