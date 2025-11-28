import { db } from '$lib/server/database';
import { dispatchConfessionViaHttp, sendFollowupMessage } from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/error';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { inngest } from '../client';

const SERVICE_NAME = 'inngest.dispatch-approval';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const enum ErrorReason {
  UnknownChannel = 'unknown_channel',
  Permission = 'permission',
}

export const dispatchApproval = inngest.createFunction(
  { id: 'discord/interaction.approve', name: 'Dispatch Approved Confession' },
  { event: 'discord/confession.approve' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('dispatch-approval', async span => {
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

      // Verify confession is actually approved (defensive check)
      if (confession.approvedAt === null) {
        logger.error('confession not approved', undefined, { internalId: event.data.internalId });
        return;
      }

      span.setAttributes({
        'confession.id': confession.confessionId,
        'channel.id': confession.channelId,
      });

      const dispatchResult = await step.run('dispatch-confession', async () => {
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
          logger.trace('approved confession dispatched', {
            'discord.message.id': result.id.toString(),
            'discord.channel.id': result.channel_id.toString(),
          });
          return;
        } catch (err) {
          if (err instanceof DiscordError) {
            switch (err.code) {
              case DiscordErrorCode.UnknownChannel:
                return ErrorReason.UnknownChannel;
              case DiscordErrorCode.MissingAccess:
              case DiscordErrorCode.MissingPermissions:
                return ErrorReason.Permission;
            }
          }
          throw err;
        }
      });

      if (dispatchResult !== null) {
        await step.run('notify-dispatch-failure', async () => {
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let errorMessage: string;
          switch (dispatchResult) {
            case ErrorReason.UnknownChannel:
              errorMessage = `${confession.channel.label} #${confession.confessionId} has been approved internally, but the confession channel no longer exists.`;
              break;
            case ErrorReason.Permission:
              errorMessage = `${confession.channel.label} #${confession.confessionId} has been approved internally, but Spectro does not have the permission to send messages to the confession channel. The confession can be resent once this has been resolved.`;
              break;
          }
          await sendFollowupMessage(event.data.interactionToken, errorMessage);
        });
        return;
      }

      logger.info('approved confession dispatched', { confessionId: confession.confessionId });
    });
  },
);
