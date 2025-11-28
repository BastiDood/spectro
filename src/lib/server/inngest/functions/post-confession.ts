import { db } from '$lib/server/database';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/error';
import { dispatchConfessionViaHttp, sendFollowupMessage } from '$lib/server/api/discord';
import { Logger } from '$lib/server/telemetry/logger';
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

      const confession = await step.run('fetch-confession', async () => {
        const result = await db.query.confession.findFirst({
          where: ({ internalId: id }, { eq }) => eq(id, internalId),
          columns: {
            confessionId: true,
            channelId: true,
            content: true,
            createdAt: true,
            approvedAt: true,
            parentMessageId: true,
          },
          with: {
            channel: {
              columns: {
                label: true,
                color: true,
              },
            },
            attachment: true,
          },
        });
        // Serialize bigints for Inngest step memoization
        if (!result) return null;
        return {
          ...result,
          confessionId: result.confessionId.toString(),
          channelId: result.channelId.toString(),
          parentMessageId: result.parentMessageId?.toString() ?? null,
          attachment: result.attachment
            ? { ...result.attachment, id: result.attachment.id.toString() }
            : null,
        };
      });

      if (confession === null) {
        logger.error('confession not found', undefined, { internalId: event.data.internalId });
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

      const dispatched = await step.run('dispatch-confession', async () => {
        const channelId = BigInt(confession.channelId);
        const confessionId = BigInt(confession.confessionId);
        const hex = confession.channel.color
          ? Number.parseInt(confession.channel.color, 2)
          : undefined;
        const parentMessageId = confession.parentMessageId
          ? BigInt(confession.parentMessageId)
          : null;
        const attachment = confession.attachment
          ? { ...confession.attachment, id: BigInt(confession.attachment.id) }
          : null;

        try {
          const result = await dispatchConfessionViaHttp(
            new Date(confession.createdAt),
            channelId,
            confessionId,
            confession.channel.label,
            hex,
            confession.content,
            parentMessageId,
            attachment,
          );
          logger.trace('confession dispatched to channel', {
            'discord.message.id': result.id.toString(),
            'discord.channel.id': result.channel_id.toString(),
          });
          return true;
        } catch (err) {
          if (err instanceof DiscordError) {
            switch (err.code) {
              case DiscordErrorCode.MissingAccess:
              case DiscordErrorCode.MissingPermissions:
                return false;
            }
          }
          throw err;
        }
      });

      if (!dispatched) {
        await step.run('notify-dispatch-failure', async () => {
          await sendFollowupMessage(
            event.data.interactionToken,
            'Spectro does not have the permission to send messages in this channel.',
          );
        });
        return;
      }

      logger.info('confession dispatched', { confessionId: confession.confessionId });
      await step.run('send-acknowledgement', async () => {
        const message = `${confession.channel.label} #${confession.confessionId} has been published.`;
        await sendFollowupMessage(event.data.interactionToken, message);
      });
    });
  },
);
