import { NonRetriableError } from 'inngest';

import {
  ConfessionChannel,
  createConfessionPayload,
  getConfessionErrorMessage,
} from '$lib/server/confession';
import { DiscordClient } from '$lib/server/api/discord';
import { db, fetchConfessionForDispatch } from '$lib/server/database';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { inngest } from '$lib/server/inngest/client';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ConfessionApprovalEvent } from './schema';

const SERVICE_NAME = 'inngest.dispatch-approval';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export const dispatchApproval = inngest.createFunction(
  {
    id: 'discord/interaction.approve',
    name: 'Dispatch Approved Confession',
    idempotency: 'event.data.interactionId',
    triggers: ConfessionApprovalEvent,
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('dispatch-approval-function', async span => {
      span.setAttributes({
        'inngest.event.id': event.id,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.internalId': event.data.internalId,
        'inngest.event.data.applicationId': event.data.applicationId,
        'inngest.event.data.interactionId': event.data.interactionId,
      });

      const result = await step.run(
        { id: 'dispatch-approval', name: 'Dispatch Approved Confession' },
        async () =>
          await tracer.asyncSpan('dispatch-approval-step', async () => {
            const confession = await fetchConfessionForDispatch(db, BigInt(event.data.internalId));
            if (confession === null) {
              const error = new NonRetriableError('confession not found');
              logger.fatal('confession not found for dispatch', error);
              throw error;
            }

            if (confession.approvedAt === null) {
              const error = new NonRetriableError('confession not approved');
              logger.fatal('confession not approved for dispatch', error);
              throw error;
            }

            logger.debug('fetched confession', {
              'confession.created': confession.createdAt,
              'confession.approved': confession.approvedAt,
              'confession.id': confession.confessionId,
              'confession.channel.id': confession.channelId,
              'confession.parent.message.id': confession.parentMessageId,
            });

            try {
              const message = await DiscordClient.ENV.createMessage(
                confession.channelId,
                createConfessionPayload(confession),
                `${event.id}:approval`,
              );

              logger.info('approved confession dispatched', {
                confessionId: confession.confessionId,
              });

              logger.trace('approved confession dispatched', {
                'discord.message.id': message.id,
                'discord.channel.id': message.channel_id,
                'discord.message.timestamp': message.timestamp,
              });
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.InvalidFormBody: {
                    const wrapped = new NonRetriableError(
                      'discord rejected createMessage nonce payload',
                      { cause: error },
                    );
                    logger.error('discord nonce validation failed in dispatch-approval', wrapped, {
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
                      status: 'approved internally',
                    });
                  default:
                    break;
                }
              throw error;
            }
          }),
      );

      if (result === null) return;

      await step.run({ id: 'send-failure-follow-up', name: 'Send Failure Follow-up' }, async () => {
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
            'discord.channel.id': message.channel_id,
            'discord.message.timestamp': message.timestamp,
          });
        } catch (cause) {
          if (cause instanceof DiscordError)
            switch (cause.code) {
              case DiscordErrorCode.UnknownWebhook:
              case DiscordErrorCode.InvalidWebhookToken: {
                const wrapped = new NonRetriableError(
                  'discord rejected approval failure follow-up',
                  { cause },
                );
                logger.error('discord rejected approval failure follow-up', wrapped, {
                  'discord.error.code': cause.code,
                  'discord.error.message': cause.message,
                });
                throw wrapped;
              }
              default:
                break;
            }
          throw cause;
        }
      });
    }),
);
