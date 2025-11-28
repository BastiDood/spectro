import { db, resetLogChannel } from '$lib/server/database';
import {
  logApprovedConfessionViaHttp,
  logPendingConfessionViaHttp,
  sendFollowupMessage,
} from '$lib/server/api/discord';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/error';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { inngest } from '../client';

const SERVICE_NAME = 'inngest.log-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const enum ErrorReason {
  UnknownChannel = 'unknown_channel',
  Permission = 'permission',
}

export const logConfession = inngest.createFunction(
  { id: 'discord/interaction.log', name: 'Log Confession' },
  { event: 'discord/confession.submit' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('log-confession', async span => {
      const internalId = BigInt(event.data.internalId);
      span.setAttribute('confession.internal.id', event.data.internalId);

      const confession = await step.run('fetch-confession', async () => {
        const result = await db.query.confession.findFirst({
          where: ({ internalId: id }, { eq }) => eq(id, internalId),
          columns: {
            internalId: true,
            confessionId: true,
            channelId: true,
            authorId: true,
            content: true,
            createdAt: true,
            approvedAt: true,
          },
          with: {
            channel: {
              columns: {
                label: true,
                logChannelId: true,
                isApprovalRequired: true,
              },
            },
            attachment: true,
          },
        });
        // Serialize bigints for Inngest step memoization
        if (!result) return null;
        return {
          ...result,
          internalId: result.internalId.toString(),
          confessionId: result.confessionId.toString(),
          channelId: result.channelId.toString(),
          authorId: result.authorId.toString(),
          channel: {
            ...result.channel,
            logChannelId: result.channel.logChannelId?.toString() ?? null,
          },
          attachment: result.attachment
            ? { ...result.attachment, id: result.attachment.id.toString() }
            : null,
        };
      });

      if (confession === null) {
        logger.error('confession not found', undefined, { internalId: event.data.internalId });
        return;
      }

      const logChannelId = confession.channel.logChannelId;
      if (logChannelId === null) {
        logger.warn('no log channel configured');
        return;
      }

      span.setAttributes({
        'confession.id': confession.confessionId,
        'log.channel.id': logChannelId,
      });

      const logResult = await step.run('log-confession', async () => {
        const logChannelIdBigInt = BigInt(logChannelId);
        const confessionIdBigInt = BigInt(confession.confessionId);
        const authorIdBigInt = BigInt(confession.authorId);
        const attachment = confession.attachment
          ? { ...confession.attachment, id: BigInt(confession.attachment.id) }
          : null;

        try {
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let result: Awaited<ReturnType<typeof logPendingConfessionViaHttp>>;
          if (confession.channel.isApprovalRequired) {
            // Log pending confession with approval buttons
            const internalIdBigInt = BigInt(confession.internalId);
            result = await logPendingConfessionViaHttp(
              new Date(confession.createdAt),
              logChannelIdBigInt,
              internalIdBigInt,
              confessionIdBigInt,
              authorIdBigInt,
              confession.channel.label,
              confession.content,
              attachment,
            );
          } else {
            // Log approved confession
            result = await logApprovedConfessionViaHttp(
              new Date(confession.createdAt),
              logChannelIdBigInt,
              confessionIdBigInt,
              authorIdBigInt,
              confession.channel.label,
              confession.content,
              attachment,
            );
          }
          logger.trace('confession logged', {
            'discord.message.id': result.id.toString(),
            'discord.channel.id': result.channel_id.toString(),
          });
          return;
        } catch (err) {
          if (err instanceof DiscordError) {
            switch (err.code) {
              case DiscordErrorCode.UnknownChannel: {
                // Reset the log channel since it was deleted
                const channelIdBigInt = BigInt(confession.channelId);
                if (await resetLogChannel(db, channelIdBigInt))
                  logger.error('log channel reset due to unknown channel');
                else logger.warn('log channel previously reset due to unknown channel');
                return ErrorReason.UnknownChannel;
              }
              case DiscordErrorCode.MissingAccess:
              case DiscordErrorCode.MissingPermissions:
                return ErrorReason.Permission;
            }
          }
          throw err;
        }
      });

      if (logResult !== null) {
        await step.run('notify-log-failure', async () => {
          const confessionStatus = confession.channel.isApprovalRequired
            ? 'submitted, but its publication is pending approval'
            : 'published';

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let warningMessage: string;
          switch (logResult) {
            case ErrorReason.UnknownChannel:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been ${confessionStatus}. Also kindly inform the moderators that Spectro has detected that the log channel had been deleted.`;
              break;
            case ErrorReason.Permission:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been ${confessionStatus}. Also kindly inform the moderators that Spectro couldn't log the confession due to insufficient log channel permissions.`;
              break;
          }

          await sendFollowupMessage(event.data.interactionToken, warningMessage);
        });
      }
    });
  },
);
