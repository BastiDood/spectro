import assert, { strictEqual } from 'node:assert/strict';

import { NonRetriableError } from 'inngest';

import { assertOptional } from '$lib/assert';
import { DiscordClient } from '$lib/server/api/discord';
import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import {
  type InsertableAttachment,
  type PersistableDurableAttachment,
  type SerializedAttachment,
  type SerializedConfessionForDispatch,
  type SerializedConfessionForProcess,
  db,
  insertConfession,
  linkDurableAttachmentData,
  resetLogChannel,
  upsertDurableAttachmentData,
} from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import type { Message } from '$lib/server/models/discord/message';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { ConfessionSubmitEvent } from './schema';

const SERVICE_NAME = 'inngest.process-confession-submission';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const enum LogConfessionResultType {
  Failed = 'failed',
  Logged = 'logged',
}

interface FailedLogConfessionResult {
  type: LogConfessionResultType.Failed;
  content: string;
  resetLogChannelId: string | null;
}

interface LoggedConfessionResult {
  type: LogConfessionResultType.Logged;
  durableAttachment: PersistableDurableAttachment | null;
  publicConfession: SerializedConfessionForDispatch;
}

type LogConfessionResult = FailedLogConfessionResult | LoggedConfessionResult;

function serializeDurableAttachment(
  durableAttachment: PersistableDurableAttachment,
): SerializedAttachment {
  return {
    id: durableAttachment.id,
    filename: durableAttachment.filename,
    contentType: durableAttachment.contentType,
    url: durableAttachment.url,
    proxyUrl: durableAttachment.proxyUrl,
    height: durableAttachment.height,
    width: durableAttachment.width,
  };
}

function createPublicConfession(
  confession: SerializedConfessionForProcess,
  attachment: SerializedAttachment | null,
) {
  return {
    confessionId: confession.confessionId,
    channelId: confession.channelId,
    content: confession.content,
    createdAt: confession.createdAt,
    approvedAt: confession.approvedAt,
    parentMessageId: confession.parentMessageId,
    channel: {
      label: confession.channel.label,
      color: confession.channel.color,
    },
    attachment,
  } satisfies SerializedConfessionForDispatch;
}

export const processConfessionSubmission = inngest.createFunction(
  {
    id: 'discord/interaction.process-confession-submission',
    name: 'Process Confession Submission',
    triggers: ConfessionSubmitEvent,
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('process-confession-submission-function', async span => {
      const { id: eventId, data } = event;
      const { applicationId, interactionId, interactionToken } = data;

      span.setAttributes({
        'inngest.event.id': eventId,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.applicationId': applicationId,
        'inngest.event.data.interactionId': interactionId,
        'channel.id': data.channelId,
        'author.id': data.authorId,
      });

      const preparationError = await step.run(
        { id: 'prepare-submission', name: 'Prepare Submission' },
        async () => {
          const createdAt = new Date(event.ts);

          const channel = await db.query.channel.findFirst({
            columns: {
              logChannelId: true,
              disabledAt: true,
            },
            where({ id }, { eq }) {
              return eq(id, BigInt(data.channelId));
            },
          });

          if (typeof channel === 'undefined')
            return 'This channel has not been set up for confessions yet.';

          if (channel.disabledAt !== null && channel.disabledAt <= createdAt) {
            const timestamp = Math.floor(channel.disabledAt.valueOf() / 1000);
            return `This channel has temporarily disabled confessions since <t:${timestamp}:R>.`;
          }

          if (channel.logChannelId === null)
            return 'Spectro cannot submit confessions until the moderators have configured a confession log.';

          return null;
        },
      );

      if (preparationError !== null) {
        await step.run(
          {
            id: 'edit-original-interaction-response-after-prepare',
            name: 'Edit Original Interaction Response',
          },
          async () => {
            try {
              await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
                content: preparationError,
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

      const createdConfession = await step.run(
        { id: 'create-confession', name: 'Create Confession' },
        async (): Promise<SerializedConfessionForProcess> => {
          const createdAt = new Date(event.ts);

          const channel = await db.query.channel.findFirst({
            columns: {
              guildId: true,
              disabledAt: true,
              logChannelId: true,
              isApprovalRequired: true,
              label: true,
              color: true,
            },
            where({ id }, { eq }) {
              return eq(id, BigInt(data.channelId));
            },
          });

          if (typeof channel === 'undefined') {
            const error = new NonRetriableError('confession channel not found');
            logger.fatal('confession channel not found for create', error, {
              'channel.id': data.channelId,
            });
            throw error;
          }

          if (channel.disabledAt !== null && channel.disabledAt <= createdAt) {
            const error = new NonRetriableError('confession channel disabled');
            logger.fatal('confession channel disabled for create', error, {
              'channel.id': data.channelId,
              'channel.disabled.at': channel.disabledAt.toISOString(),
            });
            throw error;
          }

          if (channel.logChannelId === null) {
            const error = new NonRetriableError('confession log channel not configured');
            logger.fatal('confession log channel not configured for create', error, {
              'channel.id': data.channelId,
            });
            throw error;
          }

          let attachment: InsertableAttachment | null = null;
          if (data.attachment !== null)
            attachment = {
              id: data.attachment.id,
              filename: data.attachment.filename,
              content_type: data.attachment.contentType ?? void 0,
              url: data.attachment.url,
              proxy_url: data.attachment.proxyUrl,
            };

          const { internalId, confessionId } = await db.transaction(
            async tx =>
              await insertConfession(
                tx,
                createdAt,
                channel.guildId,
                BigInt(data.channelId),
                BigInt(data.authorId),
                data.content,
                channel.isApprovalRequired ? null : createdAt,
                data.parentMessageId === null ? null : BigInt(data.parentMessageId),
                attachment,
              ),
          );

          return {
            internalId: internalId.toString(),
            confessionId: confessionId.toString(),
            channelId: data.channelId,
            authorId: data.authorId,
            content: data.content,
            createdAt: createdAt.toISOString(),
            approvedAt: channel.isApprovalRequired ? null : createdAt.toISOString(),
            parentMessageId: data.parentMessageId,
            channel: {
              label: channel.label,
              color: channel.color,
              logChannelId: channel.logChannelId.toString(),
              isApprovalRequired: channel.isApprovalRequired,
            },
            attachment:
              data.attachment === null
                ? null
                : {
                    id: data.attachment.id,
                    filename: data.attachment.filename,
                    contentType: data.attachment.contentType,
                    url: data.attachment.url,
                    proxyUrl: data.attachment.proxyUrl,
                  },
          };
        },
      );

      const logResult = await step.run(
        { id: 'log-confession', name: 'Log Confession' },
        async (): Promise<LogConfessionResult> => {
          const confession = createdConfession;

          if (confession.channel.logChannelId === null)
            return {
              type: LogConfessionResultType.Failed,
              content: `Spectro has received your confession, but the moderators have not yet configured a channel for logging confessions. Kindly remind the server moderators to set up the logging channel and ask them resend your confession: **${confession.channel.label} #${confession.confessionId}**.`,
              resetLogChannelId: null,
            };

          const mode = confession.channel.isApprovalRequired
            ? {
                type: LogPayloadType.Pending as const,
                internalId: BigInt(confession.internalId),
              }
            : { type: LogPayloadType.Approved as const };

          if (confession.attachment === null) {
            // eslint-disable-next-line @typescript-eslint/init-declarations
            let message: Message;
            try {
              message = await DiscordClient.ENV.createMessage(
                confession.channel.logChannelId,
                createLogPayload(confession, mode),
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
                      'discord nonce validation failed in process-confession-submission',
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
                      type: LogConfessionResultType.Failed,
                      content: getConfessionErrorMessage(error.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Log,
                        status: confession.channel.isApprovalRequired
                          ? 'submitted, but its publication is pending approval'
                          : 'published',
                      }),
                      resetLogChannelId: confession.channelId,
                    };
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return {
                      type: LogConfessionResultType.Failed,
                      content: getConfessionErrorMessage(error.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Log,
                        status: confession.channel.isApprovalRequired
                          ? 'submitted, but its publication is pending approval'
                          : 'published',
                      }),
                      resetLogChannelId: null,
                    };
                  default:
                    break;
                }
              throw error;
            }

            logger.info('confession logged', {
              'discord.message.id': message.id,
              'discord.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });
            return {
              type: LogConfessionResultType.Logged,
              durableAttachment: null,
              publicConfession: createPublicConfession(confession, null),
            };
          }

          const uploadedAttachment = confession.attachment;
          const response = await fetch(uploadedAttachment.url);
          if (!response.ok) throw new Error('failed to download attachment');
          const file = await response.arrayBuffer();

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let message: Message;
          try {
            message = await DiscordClient.ENV.createMessage(
              confession.channel.logChannelId,
              createLogPayload(confession, mode, `attachment://${uploadedAttachment.filename}`),
              `${eventId}:log`,
              [
                {
                  contentType: uploadedAttachment.contentType ?? void 0,
                  data: file,
                  filename: uploadedAttachment.filename,
                },
              ],
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
                    'discord nonce validation failed in process-confession-submission',
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
                    type: LogConfessionResultType.Failed,
                    content: getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: confession.channel.isApprovalRequired
                        ? 'submitted, but its publication is pending approval'
                        : 'published',
                    }),
                    resetLogChannelId: confession.channelId,
                  };
                case DiscordErrorCode.MissingAccess:
                case DiscordErrorCode.MissingPermissions:
                  return {
                    type: LogConfessionResultType.Failed,
                    content: getConfessionErrorMessage(error.code, {
                      label: confession.channel.label,
                      confessionId: confession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: confession.channel.isApprovalRequired
                        ? 'submitted, but its publication is pending approval'
                        : 'published',
                    }),
                    resetLogChannelId: null,
                  };
                default:
                  break;
              }
            throw error;
          }

          const attachment = assertOptional(message.attachments ?? []);
          let durableAttachment: PersistableDurableAttachment | null = null;
          if (typeof attachment === 'undefined') {
            const embed = assertOptional(message.embeds ?? []);
            if (typeof embed !== 'undefined') {
              assert(typeof embed.image !== 'undefined');
              assert(typeof embed.image.proxy_url !== 'undefined');

              const url = new URL(embed.image.url);
              const [root, namespace, channelId, attachmentId, filename, ...rest] =
                url.pathname.split('/');
              strictEqual(rest.length, 0);
              strictEqual(root, '');
              assert(typeof filename !== 'undefined');
              assert(typeof attachmentId !== 'undefined');
              strictEqual(channelId, message.channel_id);
              strictEqual(namespace, 'attachments');

              durableAttachment = {
                id: attachmentId,
                messageId: message.id,
                channelId: message.channel_id,
                filename,
                url: embed.image.url,
                proxyUrl: embed.image.proxy_url,
                contentType: embed.image.content_type ?? null,
                height: embed.image.height ?? null,
                width: embed.image.width ?? null,
              };
            }
          } else {
            durableAttachment = {
              id: attachment.id,
              messageId: message.id,
              channelId: message.channel_id,
              filename: attachment.filename,
              contentType: attachment.content_type ?? null,
              url: attachment.url,
              proxyUrl: attachment.proxy_url,
              height: attachment.height ?? null,
              width: attachment.width ?? null,
            };
          }

          if (durableAttachment === null) {
            const error = new NonRetriableError('durable attachment not found');
            logger.fatal('durable attachment not found after log upload', error, {
              'confession.internal.id': confession.internalId,
              'attachment.id': uploadedAttachment.id,
            });
            throw error;
          }

          logger.info('confession logged', {
            'discord.message.id': message.id,
            'discord.channel.id': message.channel_id,
            'discord.message.timestamp': message.timestamp,
          });

          return {
            type: LogConfessionResultType.Logged,
            durableAttachment,
            publicConfession: createPublicConfession(
              confession,
              serializeDurableAttachment(durableAttachment),
            ),
          };
        },
      );

      switch (logResult.type) {
        case LogConfessionResultType.Failed:
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
                await DiscordClient.editOriginalInteractionResponse(
                  applicationId,
                  interactionToken,
                  {
                    content: logResult.content,
                  },
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
        case LogConfessionResultType.Logged:
          break;
        default: {
          const error = new NonRetriableError('unknown log confession result');
          logger.fatal('unknown log confession result', error);
          throw error;
        }
      }

      const { durableAttachment, publicConfession } = logResult;
      if (durableAttachment !== null) {
        const { attachment } = createdConfession;
        assert(attachment !== null);
        await step.run(
          {
            id: 'persist-durable-attachment',
            name: 'Persist Durable Attachment',
          },
          async () =>
            await db.transaction(async tx => {
              await upsertDurableAttachmentData(tx, BigInt(attachment.id), durableAttachment);
              await linkDurableAttachmentData(
                tx,
                BigInt(attachment.id),
                BigInt(durableAttachment.id),
              );
            }),
        );
      }

      if (createdConfession.approvedAt !== null) {
        const postResult = await step.run(
          { id: 'post-confession', name: 'Post Confession' },
          async () => {
            // eslint-disable-next-line @typescript-eslint/init-declarations
            let message: Message;
            try {
              message = await DiscordClient.ENV.createMessage(
                publicConfession.channelId,
                createConfessionPayload(publicConfession),
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
                      'discord nonce validation failed in process-confession-submission',
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
                      label: publicConfession.channel.label,
                      confessionId: publicConfession.confessionId,
                      channel: ConfessionChannel.Confession,
                      status: 'submitted',
                    });
                  default:
                    break;
                }
              throw error;
            }

            logger.info('confession published', {
              'discord.message.id': message.id,
              'discord.message.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });
            return null;
          },
        );

        if (postResult !== null) {
          await step.run(
            {
              id: 'edit-original-interaction-response-after-post',
              name: 'Edit Original Interaction Response',
            },
            async () => {
              try {
                await DiscordClient.editOriginalInteractionResponse(
                  applicationId,
                  interactionToken,
                  {
                    content: postResult,
                  },
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
