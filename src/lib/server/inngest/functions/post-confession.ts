import { NonRetriableError } from 'inngest';

import {
  ConfessionChannel,
  createConfessionPayload,
  getConfessionErrorMessage,
} from '$lib/server/confession';
import { createMessage, sendFollowupMessage } from '$lib/server/api/discord';
import { db, fetchConfessionForDispatch } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';
import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/errors';
import type { Message } from '$lib/server/models/discord/message';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.post-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const enum Result {
  Success = 'success',
  Pending = 'pending',
  Failure = 'failure',
}

interface Success {
  type: Result.Success;
  confessionId: string;
  channelLabel: string;
}

interface Pending {
  type: Result.Pending;
  confessionId: string;
  channelLabel: string;
}

interface Failure {
  type: Result.Failure;
  message: string;
}

export const postConfession = inngest.createFunction(
  { id: 'discord/interaction.post', name: 'Post Confession to Channel' },
  { event: 'discord/confession.submit' },
  async ({ event, step }) =>
    await tracer.asyncSpan('post-confession-function', async span => {
      span.setAttribute('confession', event.data.internalId);
      if (typeof event.data.moderatorId !== 'undefined')
        span.setAttribute('confession.moderator.id', event.data.moderatorId);

      const result = await step.run(
        { id: 'post-confession', name: 'Post Confession' },
        async () =>
          await tracer.asyncSpan('post-confession-step', async () => {
            // We refetch per step to avoid caching sensitive confessions in Inngest.
            const confession = await fetchConfessionForDispatch(db, BigInt(event.data.internalId));
            if (confession === null) {
              const error = new NonRetriableError('confession not found');
              logger.error('confession not found for post', error, {
                'confession.internal.id': event.data.internalId,
              });
              throw error;
            }

            if (confession.approvedAt === null) {
              logger.warn('confession pending approval, skipping post');
              return {
                type: Result.Pending,
                confessionId: confession.confessionId,
                channelLabel: confession.channel.label,
              } as Pending;
            }

            logger.debug('fetched confession', {
              'confession.created': confession.createdAt,
              'confession.approved': confession.approvedAt,
              'confession.id': confession.confessionId,
              'confession.channel.id': confession.channelId,
              'confession.parent.message.id': confession.parentMessageId,
            });

            // eslint-disable-next-line @typescript-eslint/init-declarations
            let message: Message;
            try {
              message = await createMessage(
                confession.channelId,
                createConfessionPayload(confession),
                DISCORD_BOT_TOKEN,
              );
            } catch (err) {
              if (err instanceof DiscordError)
                switch (err.code) {
                  case DiscordErrorCode.UnknownChannel:
                  case DiscordErrorCode.MissingAccess:
                  case DiscordErrorCode.MissingPermissions:
                    return {
                      type: Result.Failure,
                      message: getConfessionErrorMessage(err.code, {
                        label: confession.channel.label,
                        confessionId: confession.confessionId,
                        channel: ConfessionChannel.Confession,
                        status: 'submitted',
                      }),
                    } as Failure;
                  default:
                    break; // might be a transient error?
                }
              throw err;
            }

            logger.info('confession published', {
              'discord.message.id': message.id,
              'discord.message.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });

            return {
              type: Result.Success,
              confessionId: confession.confessionId,
              channelLabel: confession.channel.label,
            } as Success;
          }),
      );

      await step.run(
        { id: 'send-acknowledgement', name: 'Send Acknowledgement' },
        async () =>
          await tracer.asyncSpan('send-acknowledgement-step', async () => {
            // eslint-disable-next-line @typescript-eslint/init-declarations
            let acknowledgement: string;
            switch (result.type) {
              case Result.Success: {
                const verb = typeof event.data.moderatorId === 'undefined' ? 'published' : 'resent';
                acknowledgement = `${result.channelLabel} #${result.confessionId} has been ${verb}.`;
                break;
              }
              case Result.Pending:
                acknowledgement = `Your confession (${result.channelLabel} #${result.confessionId}) has been submitted and is pending moderator approval.`;
                break;
              case Result.Failure:
                acknowledgement = result.message;
                break;
              default:
                throw new Error('unreachable');
            }
            const message = await sendFollowupMessage(event.data.interactionToken, acknowledgement);
            logger.info('acknowledgement sent', {
              'discord.message.id': message.id,
              'discord.message.channel.id': message.channel_id,
              'discord.message.timestamp': message.timestamp,
            });
          }),
      );
    }),
);
