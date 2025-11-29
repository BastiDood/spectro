import { DiscordErrorCode } from '$lib/server/models/discord/error';
import { fetchConfessionForLog } from '$lib/server/database';
import { Logger } from '$lib/server/telemetry/logger';
import { logPostedConfession } from '$lib/server/confession';
import { sendFollowupMessage } from '$lib/server/api/discord';
import { Tracer } from '$lib/server/telemetry/tracer';

import { inngest } from '../client';

const SERVICE_NAME = 'inngest.log-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export const logConfession = inngest.createFunction(
  { id: 'discord/interaction.log', name: 'Log Confession' },
  { event: 'discord/confession.submit' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('log-confession', async span => {
      const internalId = BigInt(event.data.internalId);
      span.setAttribute('confession.internal.id', event.data.internalId);

      const confession = await step.run(
        'fetch-confession',
        async () => await fetchConfessionForLog(internalId),
      );

      if (confession === null) {
        logger.error('confession not found', void 0, { internalId: event.data.internalId });
        return;
      }

      const { logChannelId } = confession.channel;
      if (logChannelId === null) {
        logger.warn('no log channel configured');
        return;
      }

      span.setAttributes({
        'confession.id': confession.confessionId,
        'log.channel.id': logChannelId,
      });

      const result = await step.run(
        'log-confession',
        async () => await logPostedConfession(confession),
      );

      if (result.ok) {
        logger.info('confession logged', { confessionId: confession.confessionId });
        logger.trace('confession logged to channel', {
          'discord.message.id': result.messageId,
          'discord.channel.id': result.channelId,
        });
        return;
      }

      await step.run('notify-log-failure', async () => {
        const confessionStatus = confession.channel.isApprovalRequired
          ? 'submitted, but its publication is pending approval'
          : 'published';

        // eslint-disable-next-line @typescript-eslint/init-declarations
        let warningMessage: string;
        switch (result.code) {
          case DiscordErrorCode.UnknownChannel:
            warningMessage = `${confession.channel.label} #${confession.confessionId} has been ${confessionStatus}. Also kindly inform the moderators that Spectro has detected that the log channel had been deleted.`;
            break;
          case DiscordErrorCode.MissingAccess:
            warningMessage = `${confession.channel.label} #${confession.confessionId} has been ${confessionStatus}. Also kindly inform the moderators that Spectro cannot access the log channel.`;
            break;
          case DiscordErrorCode.MissingPermissions:
            warningMessage = `${confession.channel.label} #${confession.confessionId} has been ${confessionStatus}. Also kindly inform the moderators that Spectro doesn't have permission to send messages in the log channel.`;
            break;
          default:
            warningMessage = `${confession.channel.label} #${confession.confessionId} has been ${confessionStatus}. Also kindly inform the moderators that an unexpected error occurred while logging the confession.`;
        }
        await sendFollowupMessage(event.data.interactionToken, warningMessage);
      });
    });
  },
);
