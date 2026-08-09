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
  MissingDurableAttachmentApprovalError,
  MissingVerdictDispatchConfessionError,
  serializeDeletedLogConfession,
  serializeLoadedApprovedConfession,
  UnavailableApprovedThreadDestinationError,
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
        'spectro.confession.verdict_at': timestamp.toISOString(),
        'spectro.confession.verdict': verdict,
        'spectro.confession.internal.id': internalId.toString(),
        'spectro.moderator.id': moderatorId,
      });

      return await db.transaction(
        async tx => {
          const confession = await loadVerdictConfession(tx, internalId);

          if (confession.missingAttachmentId !== null && verdict === ConfessionVerdict.Approve)
            MissingDurableAttachmentApprovalError.throwNew();

          if (confession.missingAttachmentId !== null)
            logger.warn(
              'Durable attachment is missing for rejected confession',
              'spectro.inngest.confession_verdict.durable_attachment_missing',
              {
                'spectro.attachment.id': confession.missingAttachmentId.toString(),
              },
            );

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
              span.setAttributes({
                'spectro.confession.id': confession.confessionId.toString(),
                'spectro.confession.verdict_applied': true,
                'spectro.database.affected_row_count': rowCount,
              });
              logger.info('Confession approved', 'spectro.inngest.confession_verdict.approved', {
                'spectro.confession.id': confession.confessionId.toString(),
              });
              return null;
            }
            case ConfessionVerdict.Delete: {
              const deleted = serializeDeletedLogConfession(confession, timestamp);
              const { rowCount } = await tx
                .delete(schema.confession)
                .where(eq(schema.confession.internalId, internalId));
              strictEqual(rowCount, 1);
              span.setAttributes({
                'spectro.confession.id': confession.confessionId.toString(),
                'spectro.confession.verdict_applied': true,
                'spectro.database.affected_row_count': rowCount,
              });
              logger.info('Confession rejected', 'spectro.inngest.confession_verdict.rejected', {
                'spectro.confession.id': confession.confessionId.toString(),
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
    if (error instanceof ConfessionVerdictError) {
      logger.warn(
        'Confession verdict failure returned to the moderator',
        'spectro.inngest.confession_verdict.failure_recovered',
        void 0,
        error,
      );
      return error.message;
    }
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
        'spectro.inngest.event.id': event.id,
        'spectro.inngest.event.name': event.name,
        'spectro.inngest.event.timestamp': event.ts,
        'spectro.inngest.event.data.internal_id': event.data.internalId,
        'spectro.inngest.event.data.application_id': event.data.applicationId,
        'spectro.inngest.event.data.interaction_id': event.data.interactionId,
        'spectro.confession.verdict': event.data.verdict,
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
              await DiscordClient.createFollowupMessage(
                event.data.applicationId,
                event.data.interactionToken,
                {
                  content: verdictResult,
                  flags: MessageFlags.Ephemeral,
                },
              );
            } catch (cause) {
              if (cause instanceof DiscordError)
                switch (cause.code) {
                  case DiscordErrorCode.UnknownWebhook:
                  case DiscordErrorCode.InvalidWebhookToken: {
                    const wrapped = new NonRetriableError(
                      'discord rejected verdict failure follow-up',
                      { cause },
                    );
                    logger.error(
                      'Discord rejected verdict failure follow-up',
                      'spectro.inngest.confession_verdict.failure_followup_exception',
                      {
                        'spectro.discord.error.code': cause.code,
                      },
                      wrapped,
                    );
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
                    logger.error(
                      'Discord rejected rejection log message edit',
                      'spectro.inngest.confession_verdict.log_message_exception',
                      {
                        'spectro.discord.error.code': cause.code,
                      },
                      wrapped,
                    );
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
            MissingVerdictDispatchConfessionError.throwNew(event.data.internalId);

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
                      logger.warn(
                        `Recovered Discord thread creation failure code ${error.code}.`,
                        'spectro.inngest.confession_verdict.thread_creation_failure_recovered',
                        { 'spectro.discord.error.code': error.code },
                        error,
                      );
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
                      logger.warn(
                        `Recovered Discord thread creation failure code ${error.code}.`,
                        'spectro.inngest.confession_verdict.thread_creation_failure_recovered',
                        { 'spectro.discord.error.code': error.code },
                        error,
                      );
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
            UnavailableApprovedThreadDestinationError.throwNew(loaded.confessionId.toString());

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
          await tracer.asyncSpan('process-confession-verdict-step', async span => {
            span.setAttributes({
              'spectro.confession.id': confession.confessionId,
              'spectro.discord.channel.id': confession.publishChannelId,
            });
            try {
              const message = await DiscordClient.ENV.createMessage(
                confession.publishChannelId,
                createConfessionPayload(confession),
                `${event.id}:approval`,
              );
              span.setAttributes({
                'spectro.discord.message.id': message.id,
                'spectro.discord.channel.id': message.channel_id,
                'spectro.discord.message.timestamp': message.timestamp,
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
                      'Discord nonce validation failed while processing confession verdict',
                      'spectro.inngest.confession_verdict.discord_message_exception',
                      {
                        'spectro.discord.error.code': error.code,
                      },
                      wrapped,
                    );
                    throw wrapped;
                  }
                  case DiscordErrorCode.UnknownChannel:
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    logger.warn(
                      `Recovered Discord publish failure code ${error.code}.`,
                      'spectro.inngest.confession_verdict.discord_message_failure_recovered',
                      { 'spectro.discord.error.code': error.code },
                      error,
                    );
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
                    logger.error(
                      'Discord rejected approval log message edit',
                      'spectro.inngest.confession_verdict.log_message_exception',
                      {
                        'spectro.discord.error.code': cause.code,
                      },
                      wrapped,
                    );
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
                  logger.error(
                    'Discord rejected failed approval log message edit',
                    'spectro.inngest.confession_verdict.log_message_exception',
                    {
                      'spectro.discord.error.code': cause.code,
                    },
                    wrapped,
                  );
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
          await DiscordClient.createFollowupMessage(
            event.data.applicationId,
            event.data.interactionToken,
            {
              content: result,
              flags: MessageFlags.Ephemeral,
            },
          );
        } catch (cause) {
          if (cause instanceof DiscordError)
            switch (cause.code) {
              case DiscordErrorCode.UnknownWebhook:
              case DiscordErrorCode.InvalidWebhookToken: {
                const wrapped = new NonRetriableError(
                  'discord rejected approval failure follow-up',
                  { cause },
                );
                logger.error(
                  'Discord rejected approval failure follow-up',
                  'spectro.inngest.confession_verdict.failure_followup_exception',
                  {
                    'spectro.discord.error.code': cause.code,
                  },
                  wrapped,
                );
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
