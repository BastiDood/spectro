import assert, { strictEqual } from 'node:assert/strict';

import type { Logger } from 'pino';

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
  logger: Logger,
  timestamp: Date,
  permissions: bigint,
  confessionChannelId: Snowflake,
  parentMessageId: Snowflake,
  authorId: Snowflake,
  content: string,
) {
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

  logger.info({ channel }, 'channel for reply submission found');

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
    );

    logger.info({ internalId, confessionId }, 'reply pending approval submitted');

    // Promise is ignored so that it runs in the background
    void doDeferredResponse(logger, async () => {
      const discordErrorCode = await logPendingConfessionViaHttp(
        logger,
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
            logger.fatal(
              { discordErrorCode },
              'unexpected error code when logging resent confession',
            );
            return `${label} #${confessionId} has been submitted, but its publication is pending approval. Also kindly inform the developers and the moderators that Spectro couldn't log the reply due to an unexpected error (${discordErrorCode}) from Discord.`;
        }

      logger.info('reply pending approval has been logged');
      return `${label} #${confessionId} has been submitted, but its publication is pending approval.`;
    });

    logger.info('reply pending approval has been submitted');
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
  );

  logger.info({ internalId, confessionId }, 'reply submitted');

  // Promise is ignored so that it runs in the background
  void doDeferredResponse(logger, async () => {
    const message = await dispatchConfessionViaHttp(
      logger,
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
      logger,
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
          logger.fatal({ discordErrorCode }, 'unexpected error code when logging replies');
          return `${label} #${confessionId} has been published, but Spectro couldn't log the reply due to an unexpected error (${discordErrorCode}) from Discord. Kindly notify the developers and the moderators about this issue.`;
      }

    return `${label} #${confessionId} has been published.`;
  });

  return `${label} #${confessionId} has been submitted.`;
}

export async function handleReplySubmit(
  logger: Logger,
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
      logger,
      timestamp,
      permissions,
      channelId,
      parentMessageId,
      authorId,
      component.value,
    );
  } catch (err) {
    if (err instanceof ReplySubmitError) {
      logger.error(err, err.message);
      return err.message;
    }
    throw err;
  }
}
