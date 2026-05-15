import { NonRetriableError } from 'inngest';

import { ATTACH_FILES } from '$lib/server/models/discord/permission';
import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import { db, resetLogChannel } from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { hasAllFlags } from '$lib/bits';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import type { Message } from '$lib/server/models/discord/message';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ConfessionResendEvent } from './schema';
import { createResendConfessionState } from './state';
import { loadResendConfession } from './query';

const SERVICE_NAME = 'inngest.process-confession-resend';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

interface LogFailure {
  content: string;
  resetLogChannelId: string | null;
}

export const processConfessionResend = inngest.createFunction(
  {
    id: 'discord/interaction.process-confession-resend',
    name: 'Process Confession Resend',
    triggers: ConfessionResendEvent,
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('process-confession-resend-function', async span => {
      const { id: eventId, data } = event;
      const { applicationId, interactionId, interactionToken } = data;

      span.setAttributes({
        'inngest.event.id': eventId,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.applicationId': applicationId,
        'inngest.event.data.interactionId': interactionId,
        'channel.id': data.channelId,
        'moderator.id': data.moderatorId,
        'confession.id': data.confessionId,
      });

      const confessionId = BigInt(data.confessionId);
      const confession = await step.run(
        { id: 'load-resend-confession', name: 'Load Resend Confession' },
        async () => {
          const loaded = await loadResendConfession(db, BigInt(data.channelId), confessionId);
          return createResendConfessionState(
            loaded,
            confessionId,
            hasAllFlags(BigInt(data.memberPermissions), ATTACH_FILES),
          );
        },
      );

      if (typeof confession === 'string') {
        await step.run(
          {
            id: 'edit-original-interaction-response-after-prepare',
            name: 'Edit Original Interaction Response',
          },
          async () => {
            try {
              await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
                content: confession,
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
                    logger.error('discord rejected original interaction response edit', wrapped, {
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
          },
        );
        return;
      }

      const logResult = await step.run(
        { id: 'log-resent-confession', name: 'Log Resent Confession' },
        async (): Promise<LogFailure | null> => {
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let message: Message;
          try {
            message = await DiscordClient.ENV.createMessage(
              confession.channel.logChannelId,
              createLogPayload(confession, {
                type: LogPayloadType.Resent,
                moderatorId: BigInt(data.moderatorId),
              }),
              `${eventId}:log`,
            );
          } catch (error) {
            if (error instanceof DiscordError)
              switch (error.code) {
                case DiscordErrorCode.InvalidFormBody: {
                  const wrapped = new NonRetriableError(
                    'discord rejected createMessage nonce payload',
                    {
                      cause: error,
                    },
                  );
                  logger.error(
                    'discord nonce validation failed in process-confession-resend',
                    wrapped,
                    {
                      'discord.error.code': error.code,
                      'discord.error.message': error.message,
                    },
                  );
                  throw wrapped;
                }
                case DiscordErrorCode.UnknownChannel:
                  return {
                    content: getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: 'resent',
                    }),
                    resetLogChannelId: confession.channelId,
                  };
                case DiscordErrorCode.MissingAccess:
                case DiscordErrorCode.MissingPermissions:
                  return {
                    content: getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: 'resent',
                    }),
                    resetLogChannelId: null,
                  };
                default:
                  break;
              }
            throw error;
          }

          logger.info('resent confession logged', {
            'discord.message.id': message.id,
            'discord.channel.id': message.channel_id,
            'discord.message.timestamp': message.timestamp,
          });
          return null;
        },
      );

      if (logResult !== null) {
        if (logResult.resetLogChannelId !== null) {
          const { resetLogChannelId } = logResult;
          await step.run(
            { id: 'reset-log-channel-after-log-failure', name: 'Reset Log Channel' },
            async () => {
              await resetLogChannel(db, BigInt(resetLogChannelId));
              logger.warn('log channel reset');
            },
          );
        }

        await step.run(
          {
            id: 'edit-original-interaction-response-after-log',
            name: 'Edit Original Interaction Response',
          },
          async () => {
            try {
              await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
                content: logResult.content,
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
                    logger.error('discord rejected original interaction response edit', wrapped, {
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
          },
        );
        return;
      }

      const resendResult = await step.run(
        { id: 'resend-confession', name: 'Resend Confession' },
        async () => {
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let message: Message;
          try {
            message = await DiscordClient.ENV.createMessage(
              confession.publishChannelId,
              createConfessionPayload(confession),
              `${eventId}:post`,
            );
          } catch (error) {
            if (error instanceof DiscordError)
              switch (error.code) {
                case DiscordErrorCode.InvalidFormBody: {
                  const wrapped = new NonRetriableError(
                    'discord rejected createMessage nonce payload',
                    {
                      cause: error,
                    },
                  );
                  logger.error(
                    'discord nonce validation failed in process-confession-resend',
                    wrapped,
                    {
                      'discord.error.code': error.code,
                      'discord.error.message': error.message,
                    },
                  );
                  throw wrapped;
                }
                case DiscordErrorCode.UnknownChannel:
                case DiscordErrorCode.MissingAccess:
                case DiscordErrorCode.MissingPermissions:
                  return getConfessionErrorMessage(error.code, {
                    label: confession.channel.label,
                    confessionId: confession.confessionId,
                    channel: ConfessionChannel.Confession,
                    status: 'resent',
                  });
                default:
                  break;
              }
            throw error;
          }

          logger.info('confession resent', {
            'discord.message.id': message.id,
            'discord.message.channel.id': message.channel_id,
            'discord.message.timestamp': message.timestamp,
          });
          return null;
        },
      );

      if (resendResult !== null) {
        await step.run(
          {
            id: 'edit-original-interaction-response-after-post',
            name: 'Edit Original Interaction Response',
          },
          async () => {
            try {
              await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
                content: resendResult,
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
                    logger.error('discord rejected original interaction response edit', wrapped, {
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
          },
        );
        return;
      }

      await step.run(
        {
          id: 'delete-original-interaction-response',
          name: 'Delete Original Interaction Response',
        },
        async () => {
          try {
            await DiscordClient.deleteOriginalInteractionResponse(applicationId, interactionToken);
          } catch (cause) {
            if (cause instanceof DiscordError)
              switch (cause.code) {
                case DiscordErrorCode.UnknownWebhook: {
                  logger.error('original interaction response webhook already gone', cause, {
                    'discord.error.code': cause.code,
                    'discord.error.message': cause.message,
                  });
                  return;
                }
                case DiscordErrorCode.InvalidWebhookToken: {
                  logger.fatal('discord rejected original interaction response deletion', cause, {
                    'discord.error.code': cause.code,
                    'discord.error.message': cause.message,
                  });
                  throw cause;
                }
                default:
                  break;
              }
            throw cause;
          }
        },
      );
    }),
);
