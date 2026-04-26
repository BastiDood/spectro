import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';

import { assertOptional } from '$lib/assert';
import { hasAllFlags } from '$lib/bits';
import { DiscordClient } from '$lib/server/api/discord';
import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import { db, fetchConfessionForResend, resetLogChannel } from '$lib/server/database';
import * as schema from '$lib/server/database/models';
import { inngest } from '$lib/server/inngest/client';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import type { Message } from '$lib/server/models/discord/message';
import { ATTACH_FILES } from '$lib/server/models/discord/permission';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ConfessionResendEvent } from './schema';

const SERVICE_NAME = 'inngest.process-confession-resend';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

class RecoverableResendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoverableResendError';
  }
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

      try {
        const internalId = await step.run(
          { id: 'prepare-resend', name: 'Prepare Resend' },
          async () => {
            const permission = BigInt(data.memberPermissions);
            const confessionId = BigInt(data.confessionId);

            const result = await db
              .select({
                internalId: schema.confession.internalId,
                logChannelId: schema.channel.logChannelId,
                approvedAt: schema.confession.approvedAt,
                attachmentId: schema.confession.attachmentId,
                durableAttachmentId: schema.durableAttachment.id,
              })
              .from(schema.confession)
              .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
              .leftJoin(
                schema.ephemeralAttachment,
                eq(schema.confession.attachmentId, schema.ephemeralAttachment.id),
              )
              .leftJoin(
                schema.durableAttachment,
                eq(schema.ephemeralAttachment.durableAttachmentId, schema.durableAttachment.id),
              )
              .where(
                and(
                  eq(schema.confession.channelId, BigInt(data.channelId)),
                  eq(schema.confession.confessionId, confessionId),
                ),
              )
              .limit(1)
              .then(assertOptional);

            if (typeof result === 'undefined')
              throw new RecoverableResendError(
                `Confession #${confessionId} does not exist in this channel.`,
              );

            if (result.approvedAt === null)
              throw new RecoverableResendError(
                `Confession #${confessionId} has not yet been approved for publication in this channel.`,
              );

            if (result.logChannelId === null)
              throw new RecoverableResendError(
                'You cannot resend confessions until a valid confession log channel has been configured.',
              );

            if (result.attachmentId !== null) {
              if (result.durableAttachmentId === null)
                throw new RecoverableResendError(
                  `Confession #${confessionId} includes a legacy attachment that is no longer available in the Discord CDN, so it cannot be resent.`,
                );

              if (!hasAllFlags(permission, ATTACH_FILES))
                throw new RecoverableResendError(
                  'You do not have the permission to resend confessions with attachments in this channel.',
                );
            }

            return result.internalId.toString();
          },
        );

        await step.run({ id: 'log-resent-confession', name: 'Log Resent Confession' }, async () => {
          const confession = await fetchConfessionForResend(db, BigInt(internalId));
          if (confession === null) {
            const error = new NonRetriableError('confession not found');
            logger.fatal('confession not found for log resend', error, {
              'confession.internal.id': internalId,
            });
            throw error;
          }

          if (confession.approvedAt === null) {
            const error = new NonRetriableError('confession not approved');
            logger.fatal('confession not approved for log resend', error, {
              'confession.internal.id': internalId,
            });
            throw error;
          }

          if (confession.channel.logChannelId === null)
            throw new RecoverableResendError(
              getConfessionErrorMessage(DiscordErrorCode.UnknownChannel, {
                label: confession.channel.label,
                confessionId: confession.confessionId,
                channel: ConfessionChannel.Log,
                status: 'resent',
              }),
            );

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
                  await resetLogChannel(db, BigInt(confession.channelId));
                  logger.warn('log channel reset');
                  throw new RecoverableResendError(
                    getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: 'resent',
                    }),
                  );
                case DiscordErrorCode.MissingAccess:
                case DiscordErrorCode.MissingPermissions:
                  throw new RecoverableResendError(
                    getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: 'resent',
                    }),
                  );
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
        });

        await step.run({ id: 'resend-confession', name: 'Resend Confession' }, async () => {
          const confession = await fetchConfessionForResend(db, BigInt(internalId));
          if (confession === null) {
            const error = new NonRetriableError('confession not found');
            logger.fatal('confession not found for resend', error, {
              'confession.internal.id': internalId,
            });
            throw error;
          }

          if (confession.approvedAt === null) {
            const error = new NonRetriableError('confession not approved');
            logger.fatal('confession not approved for resend', error, {
              'confession.internal.id': internalId,
            });
            throw error;
          }

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let message: Message;
          try {
            message = await DiscordClient.ENV.createMessage(
              confession.channelId,
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
                  throw new RecoverableResendError(
                    getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Confession,
                      status: 'resent',
                    }),
                  );
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
        });
      } catch (error) {
        if (error instanceof RecoverableResendError) {
          await step.run(
            {
              id: 'edit-original-interaction-response',
              name: 'Edit Original Interaction Response',
            },
            async () => {
              try {
                await DiscordClient.editOriginalInteractionResponse(
                  applicationId,
                  interactionToken,
                  { content: error.message },
                );
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
        throw error;
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
                case DiscordErrorCode.UnknownWebhook:
                case DiscordErrorCode.InvalidWebhookToken: {
                  const wrapped = new NonRetriableError(
                    'discord rejected original interaction response deletion',
                    { cause },
                  );
                  logger.error('discord rejected original interaction response deletion', wrapped, {
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
    }),
);
