import { strictEqual } from 'node:assert/strict';

import { eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';

import * as schema from '$lib/server/database/models';
import {
  ConfessionChannel,
  createConfessionPayload,
  createLogPayload,
  getConfessionErrorMessage,
  getThreadCreationErrorMessage,
  LogPayloadType,
} from '$lib/server/confession';
import { db, resolveApprovedChannelThread } from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { Tracer } from '$lib/server/telemetry/tracer';
import { UnreachableCodeError } from '$lib/assert';

import {
  AlreadyApprovedApprovalError,
  type ApprovedConfession,
  ConfessionVerdictError,
  DisabledChannelConfessError,
  FatalConfessionVerdictStateError,
  MissingDurableAttachmentApprovalError,
  serializeDeletedLogConfession,
  serializeLoadedApprovedConfession,
} from './state';
import { ConfessionVerdict, ConfessionVerdictEvent } from './schema';
import { loadApprovedConfession, loadVerdictConfession } from './query';

const SERVICE_NAME = 'inngest.process-confession-verdict';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

interface CreatedThreadResult {
  ok: true;
  threadId: string;
}

interface FailedThreadCreationResult {
  ok: false;
  content: string;
}

type ThreadCreationResult = CreatedThreadResult | FailedThreadCreationResult;

async function submitConfessionVerdict(
  timestamp: Date,
  internalId: bigint,
  moderatorId: string,
  verdict: ConfessionVerdict,
) {
  try {
    return await tracer.asyncSpan('submit-verdict', async span => {
      span.setAttributes({
        timestamp: timestamp.toISOString(),
        'confession.verdict': verdict,
        'confession.internal.id': internalId.toString(),
        'moderator.id': moderatorId,
      });

      return await db.transaction(
        async tx => {
          const confession = await loadVerdictConfession(tx, internalId);

          if (confession.missingAttachmentId !== null && verdict === ConfessionVerdict.Approve)
            MissingDurableAttachmentApprovalError.throwNew();

          if (confession.missingAttachmentId !== null)
            logger.warn('durable attachment missing for rejected confession', {
              'attachment.id': confession.missingAttachmentId.toString(),
            });

          if (confession.disabledAt !== null && confession.disabledAt <= timestamp)
            DisabledChannelConfessError.throwNew(confession.disabledAt);

          if (confession.approvedAt !== null)
            AlreadyApprovedApprovalError.throwNew(confession.approvedAt);

          switch (verdict) {
            case ConfessionVerdict.Approve: {
              const { rowCount } = await tx
                .update(schema.confession)
                .set({ approvedAt: timestamp })
                .where(eq(schema.confession.internalId, internalId));
              strictEqual(rowCount, 1);
              logger.info('confession approved', {
                'confession.id': confession.confessionId.toString(),
              });
              return null;
            }
            case ConfessionVerdict.Delete: {
              const deleted = serializeDeletedLogConfession(confession, timestamp);
              const { rowCount } = await tx
                .delete(schema.confession)
                .where(eq(schema.confession.internalId, internalId));
              strictEqual(rowCount, 1);
              logger.info('confession rejected', {
                'confession.id': confession.confessionId.toString(),
              });
              return deleted;
            }
            default:
              UnreachableCodeError.throwNew();
          }
        },
        { isolationLevel: 'read committed' },
      );
    });
  } catch (error) {
    if (error instanceof ConfessionVerdictError) return error.message;
    throw error;
  }
}

export const processConfessionVerdict = inngest.createFunction(
  {
    id: 'discord/interaction.process-confession-verdict',
    name: 'Process Confession Verdict',
    triggers: ConfessionVerdictEvent,
    singleton: {
      key: 'event.data.internalId',
      mode: 'skip',
    },
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('process-confession-verdict-function', async span => {
      span.setAttributes({
        'inngest.event.id': event.id,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.internalId': event.data.internalId,
        'inngest.event.data.applicationId': event.data.applicationId,
        'inngest.event.data.interactionId': event.data.interactionId,
        'confession.verdict': event.data.verdict,
      });

      const verdictResult = await step.run(
        { id: 'submit-verdict', name: 'Submit Confession Verdict' },
        async () =>
          await submitConfessionVerdict(
            new Date(event.ts),
            BigInt(event.data.internalId),
            event.data.moderatorId,
            event.data.verdict,
          ),
      );

      if (typeof verdictResult === 'string') {
        await step.run(
          { id: 'send-verdict-failure-follow-up', name: 'Send Verdict Failure Follow-up' },
          async () => {
            try {
              const message = await DiscordClient.createFollowupMessage(
                event.data.applicationId,
                event.data.interactionToken,
                {
                  content: verdictResult,
                  flags: MessageFlags.Ephemeral,
                },
              );
              logger.info('verdict failure follow-up sent', {
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
                      'discord rejected verdict failure follow-up',
                      { cause },
                    );
                    logger.error('discord rejected verdict failure follow-up', wrapped, {
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

      if (verdictResult !== null) {
        await step.run(
          { id: 'edit-rejected-log-message', name: 'Edit Rejected Log Message' },
          async () => {
            try {
              await DiscordClient.editOriginalInteractionResponse(
                event.data.applicationId,
                event.data.interactionToken,
                createLogPayload(
                  verdictResult,
                  {
                    type: LogPayloadType.VerdictDeleted,
                    moderatorId: BigInt(event.data.moderatorId),
                    timestamp: new Date(event.ts),
                  },
                  verdictResult.attachment?.url,
                ),
              );
            } catch (cause) {
              if (cause instanceof DiscordError)
                switch (cause.code) {
                  case DiscordErrorCode.UnknownWebhook:
                  case DiscordErrorCode.InvalidWebhookToken: {
                    const wrapped = new NonRetriableError(
                      'discord rejected rejection log message edit',
                      { cause },
                    );
                    logger.error('discord rejected rejection log message edit', wrapped, {
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

      const loaded = await step.run(
        { id: 'load-approved-confession', name: 'Load Approved Confession' },
        async () => {
          const loaded = await loadApprovedConfession(db, BigInt(event.data.internalId));
          if (typeof loaded === 'undefined')
            FatalConfessionVerdictStateError.throwNew('confession not found for dispatch');

          logger.debug('fetched confession', {
            'confession.created': loaded.createdAt.toISOString(),
            'confession.approved': loaded.approvedAt.toISOString(),
            'confession.id': loaded.confessionId.toString(),
            'confession.channel.id': loaded.channelId.toString(),
            'confession.parent.message.id': loaded.parentMessageId?.toString() ?? null,
          });

          return serializeLoadedApprovedConfession(loaded);
        },
      );

      let resolvedThreadId: string | null = null;
      let pendingChannelThreadId: string | null = null;
      let thread: ApprovedConfession['thread'] = null;
      if (loaded.pendingThread !== null) {
        const { pendingThread } = loaded;
        pendingChannelThreadId = pendingThread.id;
        resolvedThreadId = pendingThread.approvedThreadId;

        if (resolvedThreadId === null) {
          const threadResult = await step.run(
            { id: 'create-discord-thread', name: 'Create Discord Thread' },
            async (): Promise<ThreadCreationResult> => {
              try {
                if (pendingThread.parentMessageId === null) {
                  const thread = await DiscordClient.ENV.createPublicThread(
                    loaded.channelId,
                    pendingThread.title,
                  );
                  return { ok: true, threadId: thread.id };
                }

                const thread = await DiscordClient.ENV.createPublicThreadFromMessage(
                  loaded.channelId,
                  pendingThread.parentMessageId,
                  pendingThread.title,
                );
                return { ok: true, threadId: thread.id };
              } catch (error) {
                if (error instanceof DiscordError)
                  switch (error.code) {
                    case DiscordErrorCode.ThreadAlreadyCreatedForMessage:
                      if (pendingThread.parentMessageId !== null)
                        return {
                          ok: true,
                          threadId: pendingThread.parentMessageId,
                        };
                      return {
                        ok: false,
                        content: getThreadCreationErrorMessage(error.code, {
                          label: loaded.channel.label,
                          confessionId: loaded.confessionId,
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
                          label: loaded.channel.label,
                          confessionId: loaded.confessionId,
                        }),
                      };
                    default:
                      break;
                  }
                throw error;
              }
            },
          );

          if (!threadResult.ok)
            FatalConfessionVerdictStateError.throwNew('approved thread destination unavailable', {
              'confession.id': loaded.confessionId,
              'failure.message': threadResult.content,
            });

          resolvedThreadId = await step.run(
            { id: 'resolve-approved-thread', name: 'Resolve Approved Thread' },
            async () => {
              const approved = await db.transaction(
                async tx =>
                  await resolveApprovedChannelThread(
                    tx,
                    BigInt(threadResult.threadId),
                    BigInt(event.data.internalId),
                  ),
                { isolationLevel: 'read committed' },
              );
              return approved.threadId.toString();
            },
          );
        }

        thread = {
          id: resolvedThreadId,
          title: pendingThread.title,
        };
      }

      const confession: ApprovedConfession = {
        confessionId: loaded.confessionId,
        channelId: loaded.channelId,
        pendingChannelThreadId,
        publishChannelId: resolvedThreadId ?? loaded.channelId,
        authorId: loaded.authorId,
        content: loaded.content,
        createdAt: loaded.createdAt,
        parentMessageId: loaded.parentMessageId,
        pendingThreadTitle: loaded.pendingThread?.title ?? null,
        channel: loaded.channel,
        thread,
        attachment: loaded.attachment,
      };

      const result = await step.run(
        { id: 'process-confession-verdict', name: 'Process Confession Verdict' },
        async () =>
          await tracer.asyncSpan('process-confession-verdict-step', async () => {
            try {
              const message = await DiscordClient.ENV.createMessage(
                confession.publishChannelId,
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
                      'discord nonce validation failed in process-confession-verdict',
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
                      status: 'approved internally',
                    });
                  default:
                    break;
                }
              throw error;
            }
          }),
      );

      if (result === null) {
        await step.run(
          { id: 'edit-approval-log-after-dispatch', name: 'Edit Approval Log After Dispatch' },
          async () => {
            try {
              await DiscordClient.editOriginalInteractionResponse(
                event.data.applicationId,
                event.data.interactionToken,
                createLogPayload(
                  confession,
                  {
                    type: LogPayloadType.VerdictApproved,
                    moderatorId: BigInt(event.data.moderatorId),
                    timestamp: new Date(event.ts),
                  },
                  confession.attachment?.url,
                ),
              );
            } catch (cause) {
              if (cause instanceof DiscordError)
                switch (cause.code) {
                  case DiscordErrorCode.UnknownWebhook:
                  case DiscordErrorCode.InvalidWebhookToken: {
                    const wrapped = new NonRetriableError(
                      'discord rejected approval log message edit',
                      { cause },
                    );
                    logger.error('discord rejected approval log message edit', wrapped, {
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
          id: 'edit-approval-log-after-dispatch-failure',
          name: 'Edit Approval Log After Failure',
        },
        async () => {
          try {
            await DiscordClient.editOriginalInteractionResponse(
              event.data.applicationId,
              event.data.interactionToken,
              createLogPayload(
                confession,
                {
                  type: LogPayloadType.VerdictApproved,
                  moderatorId: BigInt(event.data.moderatorId),
                  timestamp: new Date(event.ts),
                },
                confession.attachment?.url,
              ),
            );
          } catch (cause) {
            if (cause instanceof DiscordError)
              switch (cause.code) {
                case DiscordErrorCode.UnknownWebhook:
                case DiscordErrorCode.InvalidWebhookToken: {
                  const wrapped = new NonRetriableError(
                    'discord rejected failed approval log message edit',
                    { cause },
                  );
                  logger.error('discord rejected failed approval log message edit', wrapped, {
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
