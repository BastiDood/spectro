import { dispatchConfession } from '$lib/server/confession';
import { fetchConfessionForDispatch } from '$lib/server/database';
import { Logger } from '$lib/server/telemetry/logger';
import { sendFollowupMessage } from '$lib/server/api/discord';
import { Tracer } from '$lib/server/telemetry/tracer';

import { inngest } from '../client';

const SERVICE_NAME = 'inngest.post-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export const postConfession = inngest.createFunction(
  { id: 'discord/interaction.post', name: 'Post Confession to Channel' },
  { event: 'discord/confession.submit' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('post-confession', async span => {
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

      // Skip dispatch if pending approval (approvedAt is null)
      if (confession.approvedAt === null) {
        logger.debug('confession pending approval, skipping dispatch', {
          confessionId: confession.confessionId,
        });
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
          await sendFollowupMessage(
            event.data.interactionToken,
            'Spectro does not have the permission to send messages in this channel.',
          );
        });
        return;
      }

      logger.info('confession dispatched', { confessionId: confession.confessionId });
      logger.trace('confession dispatched to channel', {
        'discord.message.id': result.messageId,
        'discord.channel.id': result.channelId,
      });

      await step.run('send-acknowledgement', async () => {
        const message = `${confession.channel.label} #${confession.confessionId} has been published.`;
        await sendFollowupMessage(event.data.interactionToken, message);
      });
    });
  },
);
