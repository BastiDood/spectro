import { DiscordErrorCode } from '$lib/server/models/discord/error';
import { dispatchConfession, logResentConfession } from '$lib/server/confession';
import { fetchConfessionForResend } from '$lib/server/database';
import { Logger } from '$lib/server/telemetry/logger';
import { sendFollowupMessage } from '$lib/server/api/discord';
import { Tracer } from '$lib/server/telemetry/tracer';

import { inngest } from '../client';

const SERVICE_NAME = 'inngest.resend-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export const resendConfession = inngest.createFunction(
  { id: 'discord/interaction.resend', name: 'Resend Confession' },
  { event: 'discord/confession.resend' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('resend-confession', async span => {
      span.setAttributes({
        'confession.internal.id': event.data.internalId,
        'moderator.id': event.data.moderatorId,
      });

      const internalId = BigInt(event.data.internalId);
      const moderatorId = BigInt(event.data.moderatorId);

      const confession = await step.run(
        'fetch-confession',
        async () => await fetchConfessionForResend(internalId),
      );

      if (confession === null) {
        logger.error('confession not found', void 0, { internalId: event.data.internalId });
        await step.run('notify-not-found', async () => {
          await sendFollowupMessage(
            event.data.interactionToken,
            'The confession could not be found.',
          );
        });
        return;
      }

      // Verify confession is approved
      if (confession.approvedAt === null) {
        logger.error('confession not approved for resend', void 0, {
          internalId: event.data.internalId,
        });
        await step.run('notify-not-approved', async () => {
          await sendFollowupMessage(
            event.data.interactionToken,
            `Confession #${confession.confessionId} has not yet been approved for publication.`,
          );
        });
        return;
      }

      span.setAttributes({
        'confession.id': confession.confessionId,
        'channel.id': confession.channelId,
      });

      const dispatchResult = await step.run(
        'dispatch-confession',
        async () => await dispatchConfession(confession),
      );

      if (!dispatchResult.ok) {
        await step.run('notify-dispatch-failure', async () => {
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let errorMessage: string;
          switch (dispatchResult.code) {
            case DiscordErrorCode.UnknownChannel:
              errorMessage = `${confession.channel.label} #${confession.confessionId} could not be resent because the confession channel no longer exists.`;
              break;
            case DiscordErrorCode.MissingAccess:
              errorMessage = `${confession.channel.label} #${confession.confessionId} could not be resent because Spectro cannot access the confession channel.`;
              break;
            case DiscordErrorCode.MissingPermissions:
              errorMessage = `${confession.channel.label} #${confession.confessionId} could not be resent because Spectro does not have the permission to send messages to the confession channel.`;
              break;
            default:
              errorMessage = `${confession.channel.label} #${confession.confessionId} could not be resent due to an unexpected error.`;
          }
          await sendFollowupMessage(event.data.interactionToken, errorMessage);
        });
        return;
      }

      logger.info('resent confession dispatched', { confessionId: confession.confessionId });
      logger.trace('resent confession dispatched to channel', {
        'discord.message.id': dispatchResult.messageId,
        'discord.channel.id': dispatchResult.channelId,
      });

      const { logChannelId } = confession.channel;
      if (logChannelId === null) {
        logger.warn('no log channel configured for resend');
        await step.run('send-acknowledgement-no-log', async () => {
          await sendFollowupMessage(
            event.data.interactionToken,
            `${confession.channel.label} #${confession.confessionId} has been resent, but no log channel is configured.`,
          );
        });
        return;
      }

      const logResult = await step.run(
        'log-resent',
        async () => await logResentConfession(confession, moderatorId),
      );

      if (!logResult.ok) {
        await step.run('notify-log-failure', async () => {
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let warningMessage: string;
          switch (logResult.code) {
            case DiscordErrorCode.UnknownChannel:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been resent, but Spectro couldn't log the confession because the log channel had been deleted.`;
              break;
            case DiscordErrorCode.MissingAccess:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been resent, but Spectro cannot access the log channel.`;
              break;
            case DiscordErrorCode.MissingPermissions:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been resent, but Spectro doesn't have permission to send messages in the log channel.`;
              break;
            default:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been resent, but an unexpected error occurred while logging the confession.`;
          }
          await sendFollowupMessage(event.data.interactionToken, warningMessage);
        });
        return;
      }

      logger.info('resent confession logged', { confessionId: confession.confessionId });
      logger.trace('resent confession logged to channel', {
        'discord.message.id': logResult.messageId,
        'discord.channel.id': logResult.channelId,
      });

      await step.run('send-acknowledgement', async () => {
        await sendFollowupMessage(
          event.data.interactionToken,
          `${confession.channel.label} #${confession.confessionId} has been resent.`,
        );
      });
    });
  },
);
