import assert, { strictEqual } from 'node:assert/strict';

import { NonRetriableError } from 'inngest';

import { assertOptional } from '$lib/assert';
import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import {
  db,
  type PersistableDurableAttachment,
  resetLogChannel,
  upsertDurableAttachmentData,
} from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import type { Message } from '$lib/server/models/discord/message';
import { Tracer } from '$lib/server/telemetry/tracer';

import {
  assertConfessionSubmissionChannel,
  createPublicConfession,
  type LogConfessionResult,
  mapConfessionSubmissionChannel,
  type SerializedConfessionForProcess,
  serializeDurableAttachment,
  serializeRequestedAttachment,
} from './state';
import { ConfessionSubmitEvent, ConfessionSubmitMode } from './schema';
import {
  createConfessionSubmission,
  ensureExistingThreadRegistration,
  insertApprovedChannelThread,
  loadApprovedThreadTitle,
  loadConfessionSubmissionChannel,
} from './query';

const SERVICE_NAME = 'inngest.process-confession-submission';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

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
          const submittedAt = new Date(event.ts);
          const channel = mapConfessionSubmissionChannel(
            await loadConfessionSubmissionChannel(db, BigInt(data.channelId)),
            submittedAt,
          );

          if (typeof channel === 'string') return channel;

          switch (data.mode) {
            case ConfessionSubmitMode.Message:
              if (data.threadId !== null) {
                if (data.threadTitle === null)
                  return 'Spectro cannot submit confessions in this thread without a thread name.';
                const { channelId, threadId, threadTitle } = data;
                return await db.transaction(
                  async tx =>
                    await ensureExistingThreadRegistration(
                      tx,
                      channel.isApprovalRequired,
                      channelId,
                      threadId,
                      threadTitle,
                    ),
                  { isolationLevel: 'read committed' },
                );
              }
              break;
            case ConfessionSubmitMode.NewThread:
              break;
            default:
              throw new NonRetriableError('unknown confession submission mode');
          }

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
          const channel = assertConfessionSubmissionChannel(
            await loadConfessionSubmissionChannel(db, BigInt(data.channelId)),
            createdAt,
            data.channelId,
          );

          let threadId: string | null = null;
          let parentMessageId: string | null = null;
          if (data.mode === ConfessionSubmitMode.Message) ({ parentMessageId, threadId } = data);

          const { internalId, confessionId, pendingChannelThreadId } = await db.transaction(
            async tx =>
              await createConfessionSubmission(tx, {
                createdAt,
                guildId: channel.guildId,
                channelId: BigInt(data.channelId),
                authorId: BigInt(data.authorId),
                content: data.content,
                isApprovalRequired: channel.isApprovalRequired,
                parentMessageId: parentMessageId === null ? null : BigInt(parentMessageId),
                attachment: serializeRequestedAttachment(data.attachment),
                newThreadTitle:
                  data.mode === ConfessionSubmitMode.NewThread ? data.threadTitle : null,
                existingThreadId: threadId === null ? null : BigInt(threadId),
              }),
            { isolationLevel: 'read committed' },
          );

          const publishChannelId = threadId ?? data.channelId;
          let thread = null;
          if (threadId !== null) {
            const title = await loadApprovedThreadTitle(
              db,
              BigInt(data.channelId),
              BigInt(threadId),
            );
            thread = { id: threadId, title };
          }

          return {
            internalId: internalId.toString(),
            confessionId: confessionId.toString(),
            channelId: data.channelId,
            pendingChannelThreadId: pendingChannelThreadId?.toString() ?? null,
            publishChannelId,
            authorId: data.authorId,
            content: data.content,
            createdAt: createdAt.toISOString(),
            approvedAt: channel.isApprovalRequired ? null : createdAt.toISOString(),
            parentMessageId,
            channel: {
              guildId: channel.guildId.toString(),
              label: channel.label,
              color: channel.color,
              logChannelId: channel.logChannelId.toString(),
              isApprovalRequired: channel.isApprovalRequired,
            },
            thread,
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

      const preparedConfession =
        data.mode === ConfessionSubmitMode.NewThread && createdConfession.approvedAt !== null
          ? await step.run(
              { id: 'create-discord-thread', name: 'Create Discord Thread' },
              async (): Promise<SerializedConfessionForProcess> => {
                assert(createdConfession.pendingChannelThreadId !== null);
                const { pendingChannelThreadId } = createdConfession;

                const thread = await DiscordClient.ENV.createPublicThread(
                  data.channelId,
                  data.threadTitle,
                  `${eventId}:thread`,
                );

                await insertApprovedChannelThread(
                  db,
                  BigInt(pendingChannelThreadId),
                  BigInt(thread.id),
                );

                return {
                  ...createdConfession,
                  publishChannelId: thread.id,
                  thread: {
                    id: thread.id,
                    title: data.threadTitle,
                  },
                };
              },
            )
          : createdConfession;

      const logResult = await step.run(
        { id: 'log-confession', name: 'Log Confession' },
        async (): Promise<LogConfessionResult> => {
          const mode = preparedConfession.channel.isApprovalRequired
            ? {
                type: LogPayloadType.Pending as const,
                internalId: BigInt(preparedConfession.internalId),
              }
            : { type: LogPayloadType.Approved as const };

          if (preparedConfession.attachment === null) {
            // eslint-disable-next-line @typescript-eslint/init-declarations
            let message: Message;
            try {
              message = await DiscordClient.ENV.createMessage(
                preparedConfession.channel.logChannelId,
                createLogPayload(preparedConfession, mode),
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
                      logged: false,
                      content: getConfessionErrorMessage(error.code, {
                        label: preparedConfession.channel.label,
                        confessionId: preparedConfession.confessionId,
                        channel: ConfessionChannel.Log,
                        status: preparedConfession.channel.isApprovalRequired
                          ? 'submitted, but its publication is pending approval'
                          : 'published',
                      }),
                      resetLogChannelId: preparedConfession.channelId,
                    };
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return {
                      logged: false,
                      content: getConfessionErrorMessage(error.code, {
                        label: preparedConfession.channel.label,
                        confessionId: preparedConfession.confessionId,
                        channel: ConfessionChannel.Log,
                        status: preparedConfession.channel.isApprovalRequired
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
              logged: true,
              durableAttachment: null,
            };
          }

          const uploadedAttachment = preparedConfession.attachment;
          const response = await fetch(uploadedAttachment.url);
          if (!response.ok) throw new Error('failed to download attachment');
          const file = await response.arrayBuffer();

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let message: Message;
          try {
            message = await DiscordClient.ENV.createMessage(
              preparedConfession.channel.logChannelId,
              createLogPayload(
                preparedConfession,
                mode,
                `attachment://${uploadedAttachment.filename}`,
              ),
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
                    logged: false,
                    content: getConfessionErrorMessage(error.code, {
                      label: preparedConfession.channel.label,
                      confessionId: preparedConfession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: preparedConfession.channel.isApprovalRequired
                        ? 'submitted, but its publication is pending approval'
                        : 'published',
                    }),
                    resetLogChannelId: preparedConfession.channelId,
                  };
                case DiscordErrorCode.MissingAccess:
                case DiscordErrorCode.MissingPermissions:
                  return {
                    logged: false,
                    content: getConfessionErrorMessage(error.code, {
                      label: preparedConfession.channel.label,
                      confessionId: preparedConfession.confessionId,
                      channel: ConfessionChannel.Log,
                      status: preparedConfession.channel.isApprovalRequired
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
              'confession.internal.id': preparedConfession.internalId,
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
            logged: true,
            durableAttachment,
          };
        },
      );

      if (!logResult.logged) {
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

      const { durableAttachment } = logResult;
      if (durableAttachment !== null) {
        const { attachment } = preparedConfession;
        assert(attachment !== null);
        await step.run(
          {
            id: 'persist-durable-attachment',
            name: 'Persist Durable Attachment',
          },
          async () =>
            await upsertDurableAttachmentData(db, BigInt(attachment.id), durableAttachment),
        );
      }

      if (preparedConfession.approvedAt === null) {
        await step.run(
          {
            id: 'edit-original-interaction-response-after-pending-log',
            name: 'Edit Original Interaction Response',
          },
          async () => {
            try {
              await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
                content: `${preparedConfession.channel.label} #${preparedConfession.confessionId} has been submitted and is pending moderator approval.`,
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

      const postResult = await step.run(
        { id: 'post-confession', name: 'Post Confession' },
        async () => {
          const publicConfession = createPublicConfession(
            preparedConfession,
            durableAttachment === null ? null : serializeDurableAttachment(durableAttachment),
          );

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let message: Message;
          try {
            message = await DiscordClient.ENV.createMessage(
              publicConfession.publishChannelId,
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
              await DiscordClient.editOriginalInteractionResponse(applicationId, interactionToken, {
                content: postResult,
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
