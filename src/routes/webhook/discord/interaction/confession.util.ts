import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { ATTACH_FILES, SEND_MESSAGES } from '$lib/server/models/discord/permission';
import { DiscordErrorCode } from '$lib/server/models/discord/error';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import {
  type InsertableAttachment,
  db,
  insertConfession,
  resetLogChannel,
} from '$lib/server/database';
import {
  dispatchConfessionViaHttp,
  logApprovedConfessionViaHttp,
  logPendingConfessionViaHttp,
} from '$lib/server/api/discord';

import { doDeferredResponse, hasAllPermissions } from './util';
import { UnexpectedDiscordErrorCode } from './errors';

const SERVICE_NAME = 'webhook.interaction.confession';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

// Shared error classes
export abstract class ConfessError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ConfessError';
  }
}

export class InsufficientPermissionsConfessionError extends ConfessError {
  constructor() {
    super('You do not have the permission to attach files to messages in this channel.');
    this.name = 'InsufficientPermissionsConfessionError';
  }
}

export class InsufficientSendMessagesConfessionError extends ConfessError {
  constructor() {
    super('Your **"Send Messages"** permission has since been revoked.');
    this.name = 'InsufficientSendMessagesConfessionError';
  }
}

export class UnknownChannelConfessError extends ConfessError {
  constructor() {
    super('This channel has not been set up for confessions yet.');
    this.name = 'UnknownChannelConfessError';
  }
}

export class DisabledChannelConfessError extends ConfessError {
  constructor(public disabledAt: Date) {
    const timestamp = Math.floor(disabledAt.valueOf() / 1000);
    super(`This channel has temporarily disabled confessions since <t:${timestamp}:R>.`);
    this.name = 'DisabledChannelConfessError';
  }
}

export class MissingLogConfessError extends ConfessError {
  constructor() {
    super(
      'Spectro cannot submit confessions until the moderators have configured a confession log.',
    );
    this.name = 'MissingLogConfessError';
  }
}

/**
 * Shared confession submission logic
 * @throws {InsufficientSendMessagesConfessionError}
 * @throws {InsufficientPermissionsConfessionError}
 * @throws {UnknownChannelConfessError}
 * @throws {DisabledChannelConfessError}
 * @throws {MissingLogConfessError}
 */
export async function submitConfession(
  timestamp: Date,
  permission: bigint,
  confessionChannelId: Snowflake,
  authorId: Snowflake,
  description: string,
  attachment: InsertableAttachment | null,
  shouldInsertAttachment: boolean,
) {
  return await tracer.asyncSpan('submit-confession', async span => {
    span.setAttributes({
      'channel.id': confessionChannelId.toString(),
      'author.id': authorId.toString(),
      'has.attachment': attachment !== null,
    });

    if (!hasAllPermissions(permission, SEND_MESSAGES))
      throw new InsufficientSendMessagesConfessionError();

    if (attachment !== null && !hasAllPermissions(permission, ATTACH_FILES))
      throw new InsufficientPermissionsConfessionError();

    const channel = await db.query.channel.findFirst({
      columns: {
        logChannelId: true,
        guildId: true,
        disabledAt: true,
        isApprovalRequired: true,
        label: true,
        color: true,
      },
      where({ id }, { eq }) {
        return eq(id, confessionChannelId);
      },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelConfessError();
    const { logChannelId, guildId, disabledAt, color, label, isApprovalRequired } = channel;
    const hex = color === null ? void 0 : Number.parseInt(color, 2);

    logger.debug('channel found', {
      'guild.id': channel.guildId.toString(),
      label: channel.label,
      'approval.required': channel.isApprovalRequired,
    });

    if (disabledAt !== null && disabledAt <= timestamp)
      throw new DisabledChannelConfessError(disabledAt);
    if (logChannelId === null) throw new MissingLogConfessError();

    if (isApprovalRequired) {
      const { internalId, confessionId } = await insertConfession(
        db,
        timestamp,
        guildId,
        confessionChannelId,
        authorId,
        description,
        null,
        null,
        attachment,
        shouldInsertAttachment,
      );

      logger.debug('confession inserted', {
        'internal.id': internalId.toString(),
        'confession.id': confessionId.toString(),
      });

      // Promise is ignored so that it runs in the background
      void doDeferredResponse(async () => {
        const discordErrorCode = await logPendingConfessionViaHttp(
          timestamp,
          logChannelId,
          internalId,
          confessionId,
          authorId,
          label,
          description,
          attachment,
        );

        if (typeof discordErrorCode === 'number')
          switch (discordErrorCode) {
            case DiscordErrorCode.UnknownChannel:
              if (await resetLogChannel(db, logChannelId))
                logger.error('log channel reset due to unknown channel');
              else logger.warn('log channel previously reset due to unknown channel');
              return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the moderators that Spectro has detected that the log channel had been deleted.`;
            case DiscordErrorCode.MissingAccess:
              logger.warn('insufficient channel permissions for the log channel');
              return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the moderators that Spectro couldn't log the confession due to insufficient log channel permissions.`;
            default:
              logger.error('unexpected error code when logging pending confession', void 0, {
                'discord.error.code': discordErrorCode,
              });
              return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the developers and the moderators that Spectro couldn't log the confession due to an unexpected error (${discordErrorCode}) from Discord.`;
          }

        logger.debug('pending confession logged');
        return `${label} #${confessionId} has been submitted, but its publication is pending approval.`;
      });

      logger.info('confession pending approval', { 'confession.id': confessionId.toString() });
      return `${label} #${confessionId} has been submitted.`;
    }

    const { internalId, confessionId } = await insertConfession(
      db,
      timestamp,
      guildId,
      confessionChannelId,
      authorId,
      description,
      timestamp,
      null,
      attachment,
      shouldInsertAttachment,
    );

    logger.debug('confession inserted', {
      'internal.id': internalId.toString(),
      'confession.id': confessionId.toString(),
    });

    // Promise is ignored so that it runs in the background
    void doDeferredResponse(async () => {
      const message = await dispatchConfessionViaHttp(
        timestamp,
        confessionChannelId,
        confessionId,
        label,
        hex,
        description,
        null,
        attachment,
      );

      if (typeof message === 'number')
        switch (message) {
          case DiscordErrorCode.MissingAccess:
            return 'Spectro does not have the permission to send messages in this channel.';
          default:
            throw new UnexpectedDiscordErrorCode(message);
        }

      const discordErrorCode = await logApprovedConfessionViaHttp(
        timestamp,
        logChannelId,
        confessionId,
        authorId,
        label,
        description,
        attachment,
      );

      if (typeof discordErrorCode === 'number')
        switch (discordErrorCode) {
          case DiscordErrorCode.UnknownChannel:
            if (await resetLogChannel(db, confessionChannelId))
              logger.error('log channel reset due to unknown channel');
            else logger.warn('log channel previously reset due to unknown channel');
            return `${label} #${confessionId} has been published, but Spectro couldn't log the confession because the log channel had been deleted. Kindly notify the moderators about the configuration issue.`;
          case DiscordErrorCode.MissingAccess:
            logger.warn('insufficient channel permissions to confession log channel');
            return `${label} #${confessionId} has been published, but Spectro couldn't log the confession due to insufficient channel permissions. Kindly notify the moderators about the configuration issue.`;
          default:
            logger.error('unexpected error code when logging confession', void 0, {
              'discord.error.code': discordErrorCode,
            });
            return `${label} #${confessionId} has been published, but Spectro couldn't log the confession due to an unexpected error (${discordErrorCode}) from Discord. Kindly notify the developers and the moderators about this issue.`;
        }

      logger.debug('confession logged');
      return `${label} #${confessionId} has been confirmed.`;
    });

    logger.info('confession published', { 'confession.id': confessionId.toString() });
    return `${label} #${confessionId} has been published.`;
  });
}
