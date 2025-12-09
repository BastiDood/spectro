import { NonRetriableError } from 'inngest';

import {
  ConfessionChannel,
  createConfessionPayload,
  getConfessionErrorMessage,
} from '$lib/server/confession';
import { createMessage, sendFollowupMessage } from '$lib/server/api/discord';
import { db, fetchConfessionForDispatch } from '$lib/server/database';
import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/error';
import { inngest } from '$lib/server/inngest/client';
import type { Message } from '$lib/server/models/discord/message';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'inngest.dispatch-approval';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export const dispatchApproval = inngest.createFunction(
  { id: 'discord/interaction.approve', name: 'Dispatch Approved Confession' },
  { event: 'discord/confession.approve' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('dispatch-approval', async span => {
      span.setAttribute('confession.internal.id', event.data.internalId);

      const error = await step.run(
        { id: 'dispatch-approval', name: 'Dispatch Approved Confession' },
        async () => {
          const confession = await fetchConfessionForDispatch(db, BigInt(event.data.internalId));
          if (confession === null) throw new NonRetriableError('confession not found');

          // Verify confession is actually approved (sanity check)
          if (confession.approvedAt === null)
            throw new NonRetriableError('confession not approved');

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
                  return getConfessionErrorMessage(err.code, {
                    label: confession.channel.label,
                    confessionId: confession.confessionId,
                    channel: ConfessionChannel.Confession,
                    status: 'approved internally',
                  });
                default:
                  break;
              }
            throw err;
          }

          logger.info('approved confession dispatched', { confessionId: confession.confessionId });
          logger.trace('approved confession dispatched', {
            'discord.message.id': message.id,
            'discord.channel.id': message.channel_id,
            'discord.message.timestamp': message.timestamp,
          });
        },
      );

      if (error === null) return;

      await step.run({ id: 'send-failure', name: 'Send Failure Message' }, async () => {
        const message = await sendFollowupMessage(event.data.interactionToken, error);
        logger.info('failure message sent', {
          'discord.message.id': message.id,
          'discord.channel.id': message.channel_id,
          'discord.message.timestamp': message.timestamp,
        });
      });
    });
  },
);
