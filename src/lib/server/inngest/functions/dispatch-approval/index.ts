import { NonRetriableError } from 'inngest';

import {
  ConfessionChannel,
  createConfessionPayload,
  getConfessionErrorMessage,
  getThreadCreationErrorMessage,
} from '$lib/server/confession';
import { db, resolveApprovedChannelThread } from '$lib/server/database';
import { DiscordClient } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { Tracer } from '$lib/server/telemetry/tracer';

import {
  type ApprovalDispatchConfession,
  FatalApprovalDispatchStateError,
  serializeLoadedApprovalConfession,
} from './state';
import { ConfessionApprovalEvent } from './schema';
import { loadApprovalDispatchConfession } from './query';

const SERVICE_NAME = 'inngest.dispatch-approval';
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

export const dispatchApproval = inngest.createFunction(
  {
    id: 'discord/interaction.approve',
    name: 'Dispatch Approved Confession',
    triggers: ConfessionApprovalEvent,
    singleton: {
      key: 'event.data.internalId',
      mode: 'skip',
    },
  },
  async ({ event, step }) =>
    await tracer.asyncSpan('dispatch-approval-function', async span => {
      span.setAttributes({
        'inngest.event.id': event.id,
        'inngest.event.name': event.name,
        'inngest.event.ts': event.ts,
        'inngest.event.data.internalId': event.data.internalId,
        'inngest.event.data.applicationId': event.data.applicationId,
        'inngest.event.data.interactionId': event.data.interactionId,
      });

      const loaded = await step.run(
        { id: 'load-approved-confession', name: 'Load Approved Confession' },
        async () => {
          const loaded = await loadApprovalDispatchConfession(db, BigInt(event.data.internalId));
          if (typeof loaded === 'undefined')
            FatalApprovalDispatchStateError.throwNew('confession not found for dispatch');

          logger.debug('fetched confession', {
            'confession.created': loaded.createdAt.toISOString(),
            'confession.approved': loaded.approvedAt.toISOString(),
            'confession.id': loaded.confessionId.toString(),
            'confession.channel.id': loaded.channelId.toString(),
            'confession.parent.message.id': loaded.parentMessageId?.toString() ?? null,
          });

          return serializeLoadedApprovalConfession(loaded);
        },
      );

      let resolvedThreadId: string | null = null;
      let pendingChannelThreadId: string | null = null;
      let thread: ApprovalDispatchConfession['thread'] = null;
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
            FatalApprovalDispatchStateError.throwNew('approved thread destination unavailable', {
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

      const confession: ApprovalDispatchConfession = {
        confessionId: loaded.confessionId,
        channelId: loaded.channelId,
        pendingChannelThreadId,
        publishChannelId: resolvedThreadId ?? loaded.channelId,
        content: loaded.content,
        createdAt: loaded.createdAt,
        parentMessageId: loaded.parentMessageId,
        pendingThreadTitle: loaded.pendingThread?.title ?? null,
        channel: loaded.channel,
        thread,
        attachment: loaded.attachment,
      };

      const result = await step.run(
        { id: 'dispatch-approval', name: 'Dispatch Approved Confession' },
        async () =>
          await tracer.asyncSpan('dispatch-approval-step', async () => {
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
            } catch (error) {
              if (error instanceof DiscordError)
                switch (error.code) {
                  case DiscordErrorCode.InvalidFormBody: {
                    const wrapped = new NonRetriableError(
                      'discord rejected createMessage nonce payload',
                      { cause: error },
                    );
                    logger.error('discord nonce validation failed in dispatch-approval', wrapped, {
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
                      status: 'approved internally',
                    });
                  default:
                    break;
                }
              throw error;
            }
          }),
      );

      if (result === null) return;

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
