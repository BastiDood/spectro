import assert, { strictEqual } from 'node:assert/strict';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { db, insertConfession, resetLogChannel } from '$lib/server/database';
import {
  dispatchConfessionViaHttp,
  logApprovedConfessionViaHttp,
  logPendingConfessionViaHttp,
} from '$lib/server/api/discord';

import { DiscordErrorCode } from '$lib/server/models/discord/error';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponents } from '$lib/server/models/discord/message/component';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { SEND_MESSAGES } from '$lib/server/models/discord/permission';

import { doDeferredResponse, hasAllPermissions } from './util';
import { UnexpectedDiscordErrorCode } from './errors';

const SERVICE_NAME = 'webhook.interaction.reply-submit';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

abstract class ReplySubmitError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ReplySubmitError';
  }
}

class InsufficientPermissionsReplySubmitError extends ReplySubmitError {
  constructor() {
    super('Your **"Send Messages"** permission has since been revoked.');
    this.name = 'InsufficientPermissionsReplySubmitError';
  }
}

class DisabledChannelReplySubmitError extends ReplySubmitError {
  constructor(public disabledAt: Date) {
    const timestamp = Math.floor(disabledAt.valueOf() / 1000);
    super(`This channel has temporarily disabled confessions since <t:${timestamp}:R>.`);
    this.name = 'DisabledChannelReplySubmitError';
  }
}

class MissingLogChannelReplySubmitError extends ReplySubmitError {
  constructor() {
    super('Spectro cannot submit replies until the moderators have configured a confession log.');
    this.name = 'MissingLogChannelReplySubmitError';
  }
}

/**
 * @throws {InsufficientPermissionsReplySubmitError}
 * @throws {DisabledChannelReplySubmitError}
 * @throws {MissingLogChannelReplySubmitError}
 */
async function submitReply(
  timestamp: Date,
  permissions: bigint,
  confessionChannelId: Snowflake,
  parentMessageId: Snowflake,
  authorId: Snowflake,
  content: string,
) {
  return await tracer.asyncSpan('submit-reply', async span => {
    span.setAttributes({
      'channel.id': confessionChannelId.toString(),
      'author.id': authorId.toString(),
      'parent.message.id': parentMessageId.toString(),
    });

    if (!hasAllPermissions(permissions, SEND_MESSAGES))
      throw new InsufficientPermissionsReplySubmitError();

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

    assert(typeof channel !== 'undefined');
    const { logChannelId, guildId, disabledAt, label, color, isApprovalRequired } = channel;
    const hex = color === null ? void 0 : Number.parseInt(color, 2);

    logger.debug('channel found', {
      'guild.id': channel.guildId.toString(),
      label: channel.label,
      'approval.required': channel.isApprovalRequired,
    });

    if (disabledAt !== null && disabledAt <= timestamp)
      throw new DisabledChannelReplySubmitError(disabledAt);
    if (logChannelId === null) throw new MissingLogChannelReplySubmitError();

    if (isApprovalRequired) {
      const { internalId, confessionId } = await insertConfession(
        db,
        timestamp,
        guildId,
        confessionChannelId,
        authorId,
        content,
        null,
        parentMessageId,
        null,
        true,
      );

      logger.debug('reply inserted', {
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
          content,
          null,
        );

        if (typeof discordErrorCode === 'number')
          switch (discordErrorCode) {
            case DiscordErrorCode.UnknownChannel:
              if (await resetLogChannel(db, confessionChannelId))
                logger.error('log channel reset due to unknown channel');
              else logger.warn('log channel previously reset due to unknown channel');
              return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the moderators that Spectro has detected that the log channel had been deleted.`;
            case DiscordErrorCode.MissingAccess:
              logger.warn('insufficient channel permissions for the log channel');
              return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the moderators that Spectro couldn't log the confession due to insufficient log channel permissions.`;
            default:
              logger.error('unexpected error code when logging pending reply', void 0, {
                'discord.error.code': discordErrorCode,
              });
              return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the developers and the moderators that Spectro couldn't log the reply due to an unexpected error (${discordErrorCode}) from Discord.`;
          }

        logger.debug('pending reply logged');
        return `${label} #${confessionId} has been submitted, but its publication is pending approval.`;
      });

      logger.info('reply pending approval', { 'confession.id': confessionId.toString() });
      return `Submitting ${label} #${confessionId}...`;
    }

    const { internalId, confessionId } = await insertConfession(
      db,
      timestamp,
      guildId,
      confessionChannelId,
      authorId,
      content,
      timestamp,
      parentMessageId,
      null,
      true,
    );

    logger.debug('reply inserted', {
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
        content,
        parentMessageId,
        null,
      );

      if (typeof message === 'number')
        switch (message) {
          case DiscordErrorCode.MissingAccess:
            return 'Spectro does not have the permission to send messages to this channel.';
          default:
            throw new UnexpectedDiscordErrorCode(message);
        }

      const discordErrorCode = await logApprovedConfessionViaHttp(
        timestamp,
        logChannelId,
        confessionId,
        authorId,
        label,
        content,
        null,
      );

      if (typeof discordErrorCode === 'number')
        switch (discordErrorCode) {
          case DiscordErrorCode.UnknownChannel:
            if (await resetLogChannel(db, logChannelId))
              logger.error('log channel reset due to unknown channel');
            else logger.warn('log channel previously reset due to unknown channel');
            return `${label} #${confessionId} has been published, but Spectro couldn't log the reply because the log channel had been deleted. Kindly notify the moderators about the configuration issue.`;
          case DiscordErrorCode.MissingAccess:
            logger.warn('insufficient channel permissions to confession log channel');
            return `${label} #${confessionId} has been published, but Spectro couldn't log the reply due to insufficient channel permissions. Kindly notify the moderators about the configuration issue.`;
          default:
            logger.error('unexpected error code when logging reply', void 0, {
              'discord.error.code': discordErrorCode,
            });
            return `${label} #${confessionId} has been published, but Spectro couldn't log the reply due to an unexpected error (${discordErrorCode}) from Discord. Kindly notify the developers and the moderators about this issue.`;
        }

      logger.debug('reply logged');
      return `${label} #${confessionId} has been published.`;
    });

    logger.info('reply published', { 'confession.id': confessionId.toString() });
    return `${label} #${confessionId} has been submitted.`;
  });
}

export async function handleReplySubmit(
  timestamp: Date,
  channelId: Snowflake,
  authorId: Snowflake,
  permissions: bigint,
  [row, ...otherRows]: MessageComponents,
) {
  strictEqual(otherRows.length, 0);
  assert(typeof row !== 'undefined');

  const [component, ...otherComponents] = row.components;
  strictEqual(otherComponents.length, 0);
  assert(typeof component !== 'undefined');

  strictEqual(component?.type, MessageComponentType.TextInput);
  assert(typeof component.value !== 'undefined');
  const parentMessageId = BigInt(component.custom_id);

  try {
    return await submitReply(
      timestamp,
      permissions,
      channelId,
      parentMessageId,
      authorId,
      component.value,
    );
  } catch (err) {
    if (err instanceof ReplySubmitError) {
      logger.error(err.message, err);
      return err.message;
    }
    throw err;
  }
}
