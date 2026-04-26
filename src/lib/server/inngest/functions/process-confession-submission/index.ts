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
  db,
  fetchConfessionForDispatch,
  fetchConfessionForProcess,
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

class RecoverableSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoverableSubmissionError';
  }
}

export const processConfessionSubmission = inngest.createFunction(
  {
    id: 'discord/interaction.process-confession-submission',
    name: 'Process Confession Submission',
    idempotency: 'event.data.interactionId',
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

      try {
        const internalId = await step.run(
          { id: 'prepare-submission', name: 'Prepare Submission' },
          async () => {
            const createdAt = new Date(event.ts);

            const channel = await db.query.channel.findFirst({
              columns: {
                logChannelId: true,
                guildId: true,
                disabledAt: true,
                isApprovalRequired: true,
              },
              where({ id }, { eq }) {
                return eq(id, BigInt(data.channelId));
              },
            });

            if (typeof channel === 'undefined')
              throw new RecoverableSubmissionError(
                'This channel has not been set up for confessions yet.',
              );

            if (channel.disabledAt !== null && channel.disabledAt <= createdAt) {
              const timestamp = Math.floor(channel.disabledAt.valueOf() / 1000);
              throw new RecoverableSubmissionError(
                `This channel has temporarily disabled confessions since <t:${timestamp}:R>.`,
              );
            }

            if (channel.logChannelId === null)
              throw new RecoverableSubmissionError(
                'Spectro cannot submit confessions until the moderators have configured a confession log.',
              );

            let attachment: InsertableAttachment | null = null;
            if (data.attachment !== null)
              attachment = {
                id: data.attachment.id,
                filename: data.attachment.filename,
                content_type: data.attachment.contentType ?? void 0,
                url: data.attachment.url,
                proxy_url: data.attachment.proxyUrl,
              };

            const { internalId } = await db.transaction(
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
            return internalId.toString();
          },
        );

        const logResult = await step.run(
          { id: 'log-confession', name: 'Log Confession' },
          async () => {
            const confession = await fetchConfessionForProcess(db, BigInt(internalId));
            if (confession === null) {
              const error = new NonRetriableError('confession not found');
              logger.fatal('confession not found for log', error, {
                'confession.internal.id': internalId,
              });
              throw error;
            }

            if (confession.channel.logChannelId === null)
              throw new RecoverableSubmissionError(
                `Spectro has received your confession, but the moderators have not yet configured a channel for logging confessions. Kindly remind the server moderators to set up the logging channel and ask them resend your confession: **${confession.channel.label} #${confession.confessionId}**.`,
              );

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
                      await resetLogChannel(db, BigInt(confession.channelId));
                      logger.warn('log channel reset');
                      throw new RecoverableSubmissionError(
                        getConfessionErrorMessage(error.code, {
                          label: confession.channel.label,
                          confessionId: confession.confessionId,
                          channel: ConfessionChannel.Log,
                          status: confession.channel.isApprovalRequired
                            ? 'submitted, but its publication is pending approval'
                            : 'published',
                        }),
                      );
                    case DiscordErrorCode.MissingAccess:
                    case DiscordErrorCode.MissingPermissions:
                      throw new RecoverableSubmissionError(
                        getConfessionErrorMessage(error.code, {
                          label: confession.channel.label,
                          confessionId: confession.confessionId,
                          channel: ConfessionChannel.Log,
                          status: confession.channel.isApprovalRequired
                            ? 'submitted, but its publication is pending approval'
                            : 'published',
                        }),
                      );
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
                attachmentId: null,
                durableAttachment: null,
                isApproved: confession.approvedAt !== null,
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
                    await resetLogChannel(db, BigInt(confession.channelId));
                    logger.warn('log channel reset');
                    throw new RecoverableSubmissionError(
                      getConfessionErrorMessage(error.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Log,
                        status: confession.channel.isApprovalRequired
                          ? 'submitted, but its publication is pending approval'
                          : 'published',
                      }),
                    );
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    throw new RecoverableSubmissionError(
                      getConfessionErrorMessage(error.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Log,
                        status: confession.channel.isApprovalRequired
                          ? 'submitted, but its publication is pending approval'
                          : 'published',
                      }),
                    );
                  default:
                    break;
                }
              throw error;
            }

            const attachment = assertOptional(message.attachments ?? []);
            let durableAttachment = null;
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

            logger.info('confession logged', {
              'discord.message.id': message.id,
              'discord.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });

            return {
              attachmentId: uploadedAttachment.id,
              durableAttachment,
              isApproved: confession.approvedAt !== null,
            };
          },
        );

        if (logResult.durableAttachment !== null && logResult.attachmentId !== null) {
          const { attachmentId, durableAttachment } = logResult;
          await step.run(
            { id: 'upsert-durable-attachment', name: 'Upsert Durable Attachment' },
            async () =>
              await upsertDurableAttachmentData(db, BigInt(attachmentId), durableAttachment),
          );
          await step.run(
            { id: 'link-durable-attachment', name: 'Link Durable Attachment' },
            async () =>
              await linkDurableAttachmentData(
                db,
                BigInt(attachmentId),
                BigInt(durableAttachment.id),
              ),
          );
        }

        if (logResult.isApproved)
          await step.run({ id: 'post-confession', name: 'Post Confession' }, async () => {
            const confession = await fetchConfessionForDispatch(db, BigInt(internalId));
            if (confession === null) {
              const error = new NonRetriableError('confession not found');
              logger.fatal('confession not found for post', error, {
                'confession.internal.id': internalId,
              });
              throw error;
            }

            if (confession.approvedAt === null) return;

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
                    throw new RecoverableSubmissionError(
                      getConfessionErrorMessage(error.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Confession,
                        status: 'submitted',
                      }),
                    );
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
          });
      } catch (error) {
        if (error instanceof RecoverableSubmissionError) {
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
                  {
                    content: error.message,
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
