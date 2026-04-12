import assert, { strictEqual } from 'node:assert/strict';

import { NonRetriableError } from 'inngest';

import { assertOptional, UnreachableCodeError } from '$lib/assert';
import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import { DiscordClient } from '$lib/server/api/discord';
import {
  db,
  fetchConfessionForDispatch,
  fetchConfessionForProcess,
  fetchConfessionForResend,
  linkDurableAttachmentData,
  resetLogChannel,
  upsertDurableAttachmentData,
} from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';
import { ConfessionProcessEvent } from '$lib/server/inngest/schema';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import type { Message } from '$lib/server/models/discord/message';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.process-confession';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const enum ProcessLogResultType {
  Failure = 'failure',
  Success = 'success',
}

async function downloadAttachment(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('failed to download attachment');
  return await response.arrayBuffer();
}

/** Tries to extract from the attachments first, and then falls back to the embed image. */
function extractDurableAttachmentFromMessage(message: Message) {
  const attachment = assertOptional(message.attachments ?? []);
  if (typeof attachment !== 'undefined')
    return {
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

  // Fall back to parsing from the embed image.
  const embed = assertOptional(message.embeds ?? []);
  if (typeof embed === 'undefined') return null;

  assert(typeof embed.image !== 'undefined');
  assert(typeof embed.image.proxy_url !== 'undefined');

  // => /attachments/CHANNEL_ID/ATTACHMENT_ID/FILENAME.ext
  const url = new URL(embed.image.url);
  const [root, namespace, channelId, attachmentId, filename, ...rest] = url.pathname.split('/');
  strictEqual(rest.length, 0);
  strictEqual(root, '');
  assert(typeof filename !== 'undefined');
  assert(typeof attachmentId !== 'undefined');
  strictEqual(channelId, message.channel_id);
  strictEqual(namespace, 'attachments');

  return {
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

export const processConfession = inngest.createFunction(
  {
    id: 'discord/interaction.process',
    name: 'Process Confession',
    singleton: { key: 'event.data.internalId', mode: 'skip' },
    triggers: [ConfessionProcessEvent],
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('process-confession-function', async span => {
      const { id: eventId } = event;
      const { applicationId, interactionToken, internalId } = event.data;

      span.setAttributes({
        'inngest.event.id': eventId,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.internalId': internalId,
        'inngest.event.data.applicationId': applicationId,
        'inngest.event.data.interactionId': event.data.interactionId,
        'inngest.event.data.moderatorId': event.data.moderatorId,
      });

      async function sendFollowUp(
        applicationId: string,
        interactionToken: string,
        content: string,
      ) {
        await tracer.asyncSpan('send-failure-follow-up-step', async () => {
          const message = await DiscordClient.createFollowupMessage(
            applicationId,
            interactionToken,
            {
              content,
              flags: MessageFlags.Ephemeral,
            },
          );
          logger.info('failure follow-up sent', {
            'discord.message.id': message.id,
            'discord.message.channel.id': message.channel_id,
            'discord.message.timestamp': message.timestamp,
          });
        });
      }

      async function postSubmittedConfession(internalId: string, eventId: string) {
        return await tracer.asyncSpan('post-confession-step', async () => {
          const confession = await fetchConfessionForDispatch(db, BigInt(internalId));
          if (confession === null) {
            const error = new NonRetriableError('confession not found');
            logger.error('confession not found for post', error, {
              'confession.internal.id': internalId,
            });
            throw error;
          }

          if (confession.approvedAt === null) return null;

          try {
            const message = await DiscordClient.ENV.createMessage(
              confession.channelId,
              createConfessionPayload(confession),
              `${eventId}:post`,
            );
            logger.info('confession published', {
              'discord.message.id': message.id,
              'discord.message.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });
            return null;
          } catch (error) {
            if (error instanceof DiscordError)
              switch (error.code) {
                case DiscordErrorCode.InvalidFormBody: {
                  const wrapped = new NonRetriableError(
                    'discord rejected createMessage nonce payload',
                    { cause: error },
                  );
                  logger.error('discord nonce validation failed in process-confession', wrapped, {
                    'inngest.event.id': eventId,
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
                    status: 'submitted',
                  });
                default:
                  break;
              }
            throw error;
          }
        });
      }

      async function postResentConfession(internalId: string, eventId: string) {
        return await tracer.asyncSpan('resend-confession-step', async () => {
          const confession = await fetchConfessionForResend(db, BigInt(internalId));
          if (confession === null) {
            const error = new NonRetriableError('confession not found');
            logger.error('confession not found for resend', error, {
              'confession.internal.id': internalId,
            });
            throw error;
          }

          if (confession.approvedAt === null) {
            const error = new NonRetriableError('confession not approved');
            logger.error('confession not approved for resend', error, {
              'confession.internal.id': internalId,
            });
            throw error;
          }

          try {
            const message = await DiscordClient.ENV.createMessage(
              confession.channelId,
              createConfessionPayload(confession),
              `${eventId}:post`,
            );
            logger.info('confession resent', {
              'discord.message.id': message.id,
              'discord.message.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });
            return null;
          } catch (error) {
            if (error instanceof DiscordError)
              switch (error.code) {
                case DiscordErrorCode.InvalidFormBody: {
                  const wrapped = new NonRetriableError(
                    'discord rejected createMessage nonce payload',
                    { cause: error },
                  );
                  logger.error('discord nonce validation failed in process-confession', wrapped, {
                    'inngest.event.id': eventId,
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
                    status: 'resent',
                  });
                default:
                  break;
              }
            throw error;
          }
        });
      }

      if (typeof event.data.moderatorId === 'undefined') {
        // Submit confession.
        const logResult = await step.run(
          { id: 'log-confession', name: 'Log Confession' },
          async () =>
            await tracer.asyncSpan('log-confession-step', async () => {
              const confession = await fetchConfessionForProcess(db, BigInt(internalId));
              if (confession === null) {
                const error = new NonRetriableError('confession not found');
                logger.error('confession not found for log', error, {
                  'confession.internal.id': internalId,
                });
                throw error;
              }

              if (confession.channel.logChannelId === null)
                return {
                  type: ProcessLogResultType.Failure,
                  failureMessage: `Spectro has received your confession, but the moderators have not yet configured a channel for logging confessions. Kindly remind the server moderators to set up the logging channel and ask them resend your confession: **${confession.channel.label} #${confession.confessionId}**.`,
                } as const;

              const mode = confession.channel.isApprovalRequired
                ? {
                    type: LogPayloadType.Pending as const,
                    internalId: BigInt(confession.internalId),
                  }
                : { type: LogPayloadType.Approved as const };

              try {
                if (confession.attachment === null) {
                  const message = await DiscordClient.ENV.createMessage(
                    confession.channel.logChannelId,
                    createLogPayload(confession, mode),
                    `${eventId}:log`,
                  );
                  logger.info('confession logged', {
                    'discord.message.id': message.id,
                    'discord.channel.id': message.channel_id,
                    'discord.message.timestamp': message.timestamp,
                  });
                  return {
                    type: ProcessLogResultType.Success,
                    attachmentId: null,
                    durableAttachment: null,
                    isApproved: confession.approvedAt !== null,
                  } as const;
                }

                const uploadedAttachment = confession.attachment;
                const data = await downloadAttachment(uploadedAttachment.url);
                const message = await DiscordClient.ENV.createMessage(
                  confession.channel.logChannelId,
                  createLogPayload(confession, mode, `attachment://${uploadedAttachment.filename}`),
                  `${eventId}:log`,
                  [
                    {
                      contentType: uploadedAttachment.contentType ?? void 0,
                      data,
                      filename: uploadedAttachment.filename,
                    },
                  ],
                );
                const durableAttachment = extractDurableAttachmentFromMessage(message);

                logger.info('confession logged', {
                  'discord.message.id': message.id,
                  'discord.channel.id': message.channel_id,
                  'discord.message.timestamp': message.timestamp,
                });

                return {
                  type: ProcessLogResultType.Success,
                  attachmentId: uploadedAttachment.id,
                  durableAttachment,
                  isApproved: confession.approvedAt !== null,
                } as const;
              } catch (error) {
                if (error instanceof DiscordError)
                  switch (error.code) {
                    case DiscordErrorCode.InvalidFormBody: {
                      const wrapped = new NonRetriableError(
                        'discord rejected createMessage nonce payload',
                        { cause: error },
                      );
                      logger.error(
                        'discord nonce validation failed in process-confession',
                        wrapped,
                        {
                          'inngest.event.id': eventId,
                          'discord.error.code': error.code,
                          'discord.error.message': error.message,
                        },
                      );
                      throw wrapped;
                    }
                    case DiscordErrorCode.UnknownChannel:
                      await resetLogChannel(db, BigInt(confession.channelId));
                      logger.warn('log channel reset');
                    // fall through to return failure
                    case DiscordErrorCode.MissingAccess:
                    case DiscordErrorCode.MissingPermissions:
                      return {
                        type: ProcessLogResultType.Failure,
                        failureMessage: getConfessionErrorMessage(error.code, {
                          label: confession.channel.label,
                          confessionId: confession.confessionId,
                          channel: ConfessionChannel.Log,
                          status: confession.channel.isApprovalRequired
                            ? 'submitted, but its publication is pending approval'
                            : 'published',
                        }),
                      } as const;
                    default:
                      break;
                  }
                throw error;
              }
            }),
        );

        switch (logResult.type) {
          case ProcessLogResultType.Failure:
            await step.run(
              { id: 'send-failure-follow-up', name: 'Send Failure Follow-up' },
              async () =>
                await sendFollowUp(applicationId, interactionToken, logResult.failureMessage),
            );
            return;
          case ProcessLogResultType.Success:
            break;
          default:
            UnreachableCodeError.throwNew();
        }

        if (logResult.durableAttachment !== null) {
          const { durableAttachment } = logResult;
          await step.run(
            { id: 'upsert-durable-attachment', name: 'Upsert Durable Attachment' },
            async () =>
              await upsertDurableAttachmentData(
                db,
                BigInt(logResult.attachmentId),
                durableAttachment,
              ),
          );
          await step.run(
            { id: 'link-durable-attachment', name: 'Link Durable Attachment' },
            async () =>
              await linkDurableAttachmentData(
                db,
                BigInt(logResult.attachmentId),
                BigInt(durableAttachment.id),
              ),
          );
        }

        if (logResult.isApproved) {
          const postResult = await step.run(
            { id: 'post-confession', name: 'Post Confession' },
            async () => await postSubmittedConfession(internalId, eventId),
          );
          if (postResult !== null)
            await step.run(
              { id: 'send-failure-follow-up', name: 'Send Failure Follow-up' },
              async () => await sendFollowUp(applicationId, interactionToken, postResult),
            );
        }
      } else {
        const { moderatorId } = event.data;
        const logResendResult = await step.run(
          { id: 'log-resent-confession', name: 'Log Resent Confession' },
          async () =>
            await tracer.asyncSpan('log-resent-confession-step', async () => {
              const confession = await fetchConfessionForResend(db, BigInt(internalId));
              if (confession === null) {
                const error = new NonRetriableError('confession not found');
                logger.error('confession not found for log resend', error, {
                  'confession.internal.id': internalId,
                });
                throw error;
              }

              if (confession.approvedAt === null) {
                const error = new NonRetriableError('confession not approved');
                logger.error('confession not approved for log resend', error, {
                  'confession.internal.id': internalId,
                });
                throw error;
              }

              if (confession.channel.logChannelId === null)
                return getConfessionErrorMessage(DiscordErrorCode.UnknownChannel, {
                  label: confession.channel.label,
                  confessionId: confession.confessionId,
                  channel: ConfessionChannel.Log,
                  status: 'resent',
                });

              try {
                const message = await DiscordClient.ENV.createMessage(
                  confession.channel.logChannelId,
                  createLogPayload(confession, {
                    type: LogPayloadType.Resent,
                    moderatorId: BigInt(moderatorId),
                  }),
                  `${eventId}:log`,
                );
                logger.info('resent confession logged', {
                  'discord.message.id': message.id,
                  'discord.channel.id': message.channel_id,
                  'discord.message.timestamp': message.timestamp,
                });
                return null;
              } catch (error) {
                if (error instanceof DiscordError)
                  switch (error.code) {
                    case DiscordErrorCode.InvalidFormBody: {
                      const wrapped = new NonRetriableError(
                        'discord rejected createMessage nonce payload',
                        { cause: error },
                      );
                      logger.error(
                        'discord nonce validation failed in process-confession',
                        wrapped,
                        {
                          'inngest.event.id': eventId,
                          'discord.error.code': error.code,
                          'discord.error.message': error.message,
                        },
                      );
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
                        status: 'resent',
                      });
                    default:
                      break;
                  }
                throw error;
              }
            }),
        );

        if (logResendResult === null) {
          const resendResult = await step.run(
            { id: 'resend-confession', name: 'Resend Confession' },
            async () => await postResentConfession(internalId, eventId),
          );
          if (resendResult !== null)
            await step.run(
              { id: 'send-failure-follow-up', name: 'Send Failure Follow-up' },
              async () => await sendFollowUp(applicationId, interactionToken, resendResult),
            );
        } else {
          await step.run(
            { id: 'send-failure-follow-up', name: 'Send Failure Follow-up' },
            async () => await sendFollowUp(applicationId, interactionToken, logResendResult),
          );
        }
      }
    }),
);
