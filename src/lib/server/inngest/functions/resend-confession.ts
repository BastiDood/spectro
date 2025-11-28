import { db, resetLogChannel } from '$lib/server/database';
import { DiscordError, DiscordErrorCode } from '$lib/server/models/discord/error';
import {
  dispatchConfessionViaHttp,
  logResentConfessionViaHttp,
  sendFollowupMessage,
} from '$lib/server/api/discord';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { inngest } from '../client';

const SERVICE_NAME = 'inngest.resend-confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const enum ErrorReason {
  UnknownChannel = 'unknown_channel',
  Permission = 'permission',
}

export const resendConfession = inngest.createFunction(
  { id: 'discord/interaction.resend', name: 'Resend Confession' },
  { event: 'discord/confession.resend' },
  async ({ event, step }) => {
    return await tracer.asyncSpan('resend-confession', async span => {
      const internalId = BigInt(event.data.internalId);
      const moderatorId = BigInt(event.data.moderatorId);
      span.setAttributes({
        'confession.internal.id': event.data.internalId,
        'moderator.id': event.data.moderatorId,
      });

      const confession = await step.run('fetch-confession', async () => {
        const result = await db.query.confession.findFirst({
          where: ({ internalId: id }, { eq }) => eq(id, internalId),
          columns: {
            confessionId: true,
            channelId: true,
            authorId: true,
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
                logChannelId: true,
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
          authorId: result.authorId.toString(),
          parentMessageId: result.parentMessageId?.toString() ?? null,
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
        logger.error('confession not approved for resend', undefined, {
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
          logger.trace('resent confession dispatched', {
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
            'Spectro does not have the permission to resend confessions to this channel.',
          );
        });
        return;
      }

      const logChannelId = confession.channel.logChannelId;
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

      const logResult = await step.run('log-resent', async () => {
        const logChannelIdBigInt = BigInt(logChannelId);
        const confessionIdBigInt = BigInt(confession.confessionId);
        const authorIdBigInt = BigInt(confession.authorId);
        const attachment = confession.attachment
          ? { ...confession.attachment, id: BigInt(confession.attachment.id) }
          : null;

        try {
          // Use current timestamp for the log entry
          const result = await logResentConfessionViaHttp(
            new Date(),
            logChannelIdBigInt,
            confessionIdBigInt,
            authorIdBigInt,
            moderatorId,
            confession.channel.label,
            confession.content,
            attachment,
          );
          logger.trace('resent confession logged', {
            'discord.message.id': result.id.toString(),
            'discord.channel.id': result.channel_id.toString(),
          });
          return;
        } catch (err) {
          if (err instanceof DiscordError) {
            switch (err.code) {
              case DiscordErrorCode.UnknownChannel: {
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
          // eslint-disable-next-line @typescript-eslint/init-declarations
          let warningMessage: string;
          switch (logResult) {
            case ErrorReason.UnknownChannel:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been resent, but Spectro couldn't log the confession because the log channel had been deleted.`;
              break;
            case ErrorReason.Permission:
              warningMessage = `${confession.channel.label} #${confession.confessionId} has been resent, but Spectro couldn't log the confession due to insufficient log channel permissions.`;
              break;
          }
          await sendFollowupMessage(event.data.interactionToken, warningMessage);
        });
        return;
      }

      logger.info('resent confession logged', { confessionId: confession.confessionId });
      await step.run('send-acknowledgement', async () => {
        await sendFollowupMessage(
          event.data.interactionToken,
          `${confession.channel.label} #${confession.confessionId} has been resent.`,
        );
      });
    });
  },
);
