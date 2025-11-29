import { DiscordErrorCode } from '$lib/server/models/discord/error';
import { dispatchConfession } from '$lib/server/confession';
import { fetchConfessionForDispatch } from '$lib/server/database';
import { Logger } from '$lib/server/telemetry/logger';
import { sendFollowupMessage } from '$lib/server/api/discord';
import { Tracer } from '$lib/server/telemetry/tracer';

import { inngest } from '../client';

const SERVICE_NAME = 'inngest.dispatch-approval';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export const dispatchApproval = inngest.createFunction(
  { id: 'discord/interaction.approve', name: 'Dispatch Approved Confession' },
  { event: 'discord/confession.approve' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('dispatch-approval', async span => {
      const internalId = BigInt(event.data.internalId);
      span.setAttribute('confession.internal.id', event.data.internalId);

      const confession = await step.run(
        'fetch-confession',
        async () => await fetchConfessionForDispatch(internalId),
      );

      if (confession === null) {
        logger.error('confession not found', void 0, { internalId: event.data.internalId });
        return;
      }

      // Verify confession is actually approved (defensive check)
      if (confession.approvedAt === null) {
        logger.error('confession not approved', void 0, { internalId: event.data.internalId });
        return;
      }

      span.setAttributes({
        'confession.id': confession.confessionId,
        'channel.id': confession.channelId,
      });

      const result = await step.run(
        'dispatch-confession',
        async () => await dispatchConfession(confession),
      );

      if (!result.ok) {
        await step.run('notify-dispatch-failure', async () => {
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let errorMessage: string;
          switch (result.code) {
            case DiscordErrorCode.UnknownChannel:
              errorMessage = `${confession.channel.label} #${confession.confessionId} has been approved internally, but the confession channel no longer exists.`;
              break;
            case DiscordErrorCode.MissingAccess:
              errorMessage = `${confession.channel.label} #${confession.confessionId} has been approved internally, but Spectro cannot access the confession channel. The confession can be resent once this has been resolved.`;
              break;
            case DiscordErrorCode.MissingPermissions:
              errorMessage = `${confession.channel.label} #${confession.confessionId} has been approved internally, but Spectro does not have the permission to send messages to the confession channel. The confession can be resent once this has been resolved.`;
              break;
            default:
              errorMessage = `${confession.channel.label} #${confession.confessionId} has been approved internally, but an unexpected error occurred while dispatching.`;
          }
          await sendFollowupMessage(event.data.interactionToken, errorMessage);
        });
        return;
      }

      logger.info('approved confession dispatched', { confessionId: confession.confessionId });
      logger.trace('approved confession dispatched', {
        'discord.message.id': result.messageId,
        'discord.channel.id': result.channelId,
      });
    });
  },
);
