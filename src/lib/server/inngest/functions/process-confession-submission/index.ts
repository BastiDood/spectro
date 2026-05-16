import { NonRetriableError } from 'inngest';

import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  getThreadCreationErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import {
  db,
  resetLogChannel,
  resolveApprovedChannelThread,
  upsertDurableAttachmentData,
} from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { extractDurableAttachmentMetadata } from '$lib/server/attachment';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import type { Message } from '$lib/server/models/discord/message';
import { parseDiscordAttachmentCdnUrl } from '$lib/url/discord';
import { Tracer } from '$lib/server/telemetry/tracer';

import {
  assertConfessionSubmissionChannel,
  createPublicConfession,
  FatalConfessionSubmissionStateError,
  type LogConfessionResult,
  mapConfessionSubmissionChannel,
  type SerializedConfessionForProcess,
  serializeDurableAttachment,
  serializeRequestedAttachment,
} from './state';
import { ConfessionSubmitEvent, ConfessionSubmitMode } from './schema';
import {
  createConfessionSubmission,
  loadApprovedThreadTitle,
  loadConfessionSubmissionChannel,
} from './query';
import { downloadDiscordAttachment } from './download';

const SERVICE_NAME = 'inngest.process-confession-submission';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const DISCORD_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

interface CreatedThreadResult {
  ok: true;
  threadId: string;
}

interface FailedThreadCreationResult {
  ok: false;
  content: string;
}

type ThreadCreationResult = CreatedThreadResult | FailedThreadCreationResult;

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
              if (data.threadId !== null && data.threadTitle === null)
                return 'Spectro cannot submit confessions in this thread without a thread name.';
            // falls through
            case ConfessionSubmitMode.NewThread:
            case ConfessionSubmitMode.NewThreadReply:
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

          let parentMessageId: string | null = null;
          let threadId: string | null = null;
          switch (data.mode) {
            case ConfessionSubmitMode.Message:
              ({ parentMessageId, threadId } = data);
              break;
            case ConfessionSubmitMode.NewThread:
              break;
            case ConfessionSubmitMode.NewThreadReply:
              ({ parentMessageId } = data);
              break;
            default:
              throw new NonRetriableError('unknown confession submission mode');
          }

          let newThreadTitle: string | null = null;
          switch (data.mode) {
            case ConfessionSubmitMode.NewThread:
            case ConfessionSubmitMode.NewThreadReply:
              newThreadTitle = data.threadTitle;
            // falls through
            default:
              break;
          }

          let existingThreadId: bigint | null = null;
          let existingThreadTitle: string | null = null;
          if (threadId !== null) {
            existingThreadId = BigInt(threadId);
            existingThreadTitle = data.threadTitle;
          }

          const { internalId, confessionId, pendingThread } = await db.transaction(
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
                newThreadTitle,
                existingThreadId,
                existingThreadTitle,
              }),
            { isolationLevel: 'read committed' },
          );

          let publishChannelId = data.channelId;
          let pendingChannelThreadId: string | null = null;
          let thread: SerializedConfessionForProcess['thread'] = null;
          if (pendingThread !== null) {
            pendingChannelThreadId = pendingThread.id.toString();
            const { approved } = pendingThread;
            if (approved !== null) {
              publishChannelId = approved.threadId.toString();
              thread = {
                id: approved.threadId.toString(),
                title: pendingThread.title,
              };
            }
          }

          return {
            internalId: internalId.toString(),
            confessionId: confessionId.toString(),
            channelId: data.channelId,
            pendingChannelThreadId,
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

      let preparedConfession = createdConfession;
      const { pendingChannelThreadId } = createdConfession;
      if (
        pendingChannelThreadId !== null &&
        createdConfession.thread === null &&
        createdConfession.approvedAt !== null
      ) {
        const threadResult = await step.run(
          { id: 'create-discord-thread', name: 'Create Discord Thread' },
          async (): Promise<ThreadCreationResult> => {
            try {
              switch (data.mode) {
                case ConfessionSubmitMode.NewThread: {
                  const thread = await DiscordClient.ENV.createPublicThread(
                    data.channelId,
                    data.threadTitle,
                  );
                  return { ok: true, threadId: thread.id };
                }
                case ConfessionSubmitMode.NewThreadReply: {
                  const thread = await DiscordClient.ENV.createPublicThreadFromMessage(
                    data.channelId,
                    data.parentMessageId,
                    data.threadTitle,
                  );
                  return { ok: true, threadId: thread.id };
                }
                case ConfessionSubmitMode.Message:
                  throw new NonRetriableError('message submission cannot create thread');
                default:
                  throw new NonRetriableError('unknown confession submission mode');
              }
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.ThreadAlreadyCreatedForMessage:
                    return data.mode === ConfessionSubmitMode.NewThreadReply
                      ? {
                          ok: true,
                          threadId: data.parentMessageId,
                        }
                      : {
                          ok: false,
                          content: getThreadCreationErrorMessage(error.code, {
                            label: createdConfession.channel.label,
                            confessionId: createdConfession.confessionId,
                          }),
                        };
                  case DiscordErrorCode.UnknownChannel:
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                  case DiscordErrorCode.ThreadLocked:
                  case DiscordErrorCode.MaxActiveThreadsReached:
                    return {
                      ok: false,
                      content: getThreadCreationErrorMessage(error.code, {
                        label: createdConfession.channel.label,
                        confessionId: createdConfession.confessionId,
                      }),
                    };
                  default:
                    break;
                }
              throw error;
            }
          },
        );

        if (!threadResult.ok) {
          await step.run(
            {
              id: 'edit-original-interaction-response-after-thread',
              name: 'Edit Original Interaction Response',
            },
            async () => {
              try {
                await DiscordClient.editOriginalInteractionResponse(
                  applicationId,
                  interactionToken,
                  { content: threadResult.content },
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

        const threadId = await step.run(
          { id: 'resolve-approved-thread', name: 'Resolve Approved Thread' },
          async () => {
            const approved = await db.transaction(
              async tx =>
                await resolveApprovedChannelThread(
                  tx,
                  BigInt(threadResult.threadId),
                  BigInt(createdConfession.internalId),
                ),
              { isolationLevel: 'read committed' },
            );
            return approved.threadId.toString();
          },
        );

        const title = await step.run(
          { id: 'load-approved-thread-title', name: 'Load Approved Thread Title' },
          async () => await loadApprovedThreadTitle(db, BigInt(data.channelId), BigInt(threadId)),
        );

        preparedConfession = {
          ...createdConfession,
          publishChannelId: threadId,
          thread: {
            id: threadId,
            title,
          },
        };
      }

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
              attachmentId: null,
              durableAttachment: null,
            };
          }

          const uploadedAttachment = preparedConfession.attachment;
          const uploadedAttachmentUrl = parseDiscordAttachmentCdnUrl(uploadedAttachment.url);
          if (uploadedAttachmentUrl === null)
            FatalConfessionSubmissionStateError.throwNew('uploaded attachment url invalid', {
              'attachment.id': uploadedAttachment.id,
              'attachment.url': uploadedAttachment.url,
            });

          const response = await fetch(uploadedAttachment.url);
          const file = await downloadDiscordAttachment(response, DISCORD_ATTACHMENT_MAX_BYTES);

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

          const durableAttachment = extractDurableAttachmentMetadata(message);
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
            attachmentId: uploadedAttachment.id,
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
      if (durableAttachment !== null)
        await step.run(
          {
            id: 'persist-durable-attachment',
            name: 'Persist Durable Attachment',
          },
          async () =>
            await upsertDurableAttachmentData(
              db,
              BigInt(logResult.attachmentId),
              durableAttachment,
            ),
        );

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
