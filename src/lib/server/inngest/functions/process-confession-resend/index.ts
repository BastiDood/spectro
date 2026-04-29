import assert from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';

import * as schema from '$lib/server/database/models';
import { assertOptional } from '$lib/assert';
import { ATTACH_FILES } from '$lib/server/models/discord/permission';
import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import { db, resetLogChannel, type SerializedConfessionForResend } from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { hasAllFlags } from '$lib/bits';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import type { Message } from '$lib/server/models/discord/message';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ConfessionResendEvent } from './schema';

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
        async (): Promise<string | SerializedConfessionForResend> => {
          const result = await db
            .select({
              confessionId: schema.confession.confessionId,
              channelId: schema.confession.channelId,
              authorId: schema.confession.authorId,
              content: schema.confession.content,
              createdAt: schema.confession.createdAt,
              approvedAt: schema.confession.approvedAt,
              parentMessageId: schema.confession.parentMessageId,
              channelLabel: schema.channel.label,
              channelColor: schema.channel.color,
              channelLogChannelId: schema.channel.logChannelId,
              ephemeralAttachmentId: schema.ephemeralAttachment.id,
              durableAttachmentId: schema.durableAttachment.id,
              attachmentFilename: schema.durableAttachment.filename,
              attachmentContentType: schema.durableAttachment.contentType,
              attachmentUrl: schema.durableAttachment.url,
              attachmentProxyUrl: schema.durableAttachment.proxyUrl,
              attachmentHeight: schema.durableAttachment.height,
              attachmentWidth: schema.durableAttachment.width,
            })
            .from(schema.confession)
            .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
            .leftJoin(
              schema.ephemeralAttachment,
              eq(schema.confession.internalId, schema.ephemeralAttachment.confessionInternalId),
            )
            .leftJoin(
              schema.durableAttachment,
              eq(schema.ephemeralAttachment.id, schema.durableAttachment.ephemeralAttachmentId),
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
            return `Confession #${confessionId} does not exist in this channel.`;

          if (result.approvedAt === null)
            return `Confession #${confessionId} has not yet been approved for publication in this channel.`;

          if (result.channelLogChannelId === null)
            return 'You cannot resend confessions until a valid confession log channel has been configured.';

          if (result.ephemeralAttachmentId !== null) {
            if (result.durableAttachmentId === null)
              return `Confession #${confessionId} includes a legacy attachment that is no longer available in the Discord CDN, so it cannot be resent.`;

            const permission = BigInt(data.memberPermissions);
            if (!hasAllFlags(permission, ATTACH_FILES))
              return 'You do not have the permission to resend confessions with attachments in this channel.';
          }

          let attachment: SerializedConfessionForResend['attachment'] = null;
          if (result.ephemeralAttachmentId !== null) {
            assert(result.durableAttachmentId !== null);
            assert(result.attachmentFilename !== null);
            assert(result.attachmentUrl !== null);
            assert(result.attachmentProxyUrl !== null);
            attachment = {
              id: result.durableAttachmentId.toString(),
              filename: result.attachmentFilename,
              contentType: result.attachmentContentType,
              url: result.attachmentUrl,
              proxyUrl: result.attachmentProxyUrl,
              height: result.attachmentHeight,
              width: result.attachmentWidth,
            };
          }

          return {
            confessionId: result.confessionId.toString(),
            channelId: result.channelId.toString(),
            authorId: result.authorId.toString(),
            content: result.content,
            createdAt: result.createdAt.toISOString(),
            approvedAt: result.approvedAt.toISOString(),
            parentMessageId: result.parentMessageId?.toString() ?? null,
            channel: {
              label: result.channelLabel,
              color: result.channelColor,
              logChannelId: result.channelLogChannelId.toString(),
            },
            attachment,
          } satisfies SerializedConfessionForResend;
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
          if (confession.approvedAt === null) {
            const error = new NonRetriableError('confession not approved');
            logger.fatal('confession not approved for log resend', error);
            throw error;
          }

          if (confession.channel.logChannelId === null)
            return {
              content: getConfessionErrorMessage(DiscordErrorCode.UnknownChannel, {
                label: confession.channel.label,
                confessionId: confession.confessionId,
                channel: ConfessionChannel.Log,
                status: 'resent',
              }),
              resetLogChannelId: null,
            };

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
          if (confession.approvedAt === null) {
            const error = new NonRetriableError('confession not approved');
            logger.fatal('confession not approved for resend', error);
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
