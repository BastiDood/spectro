import { strictEqual } from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { attachment, channel, confession } from '$lib/server/database/models';
import { db, resetLogChannel } from '$lib/server/database';
import { dispatchConfessionViaHttp, logResentConfessionViaHttp } from '$lib/server/api/discord';

import { ATTACH_FILES } from '$lib/server/models/discord/permission';
import { DiscordErrorCode } from '$lib/server/models/discord/error';
import type { EmbedAttachment } from '$lib/server/models/discord/attachment';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { doDeferredResponse, hasAllPermissions } from './util';
import { UnexpectedDiscordErrorCode } from './errors';

const SERVICE_NAME = 'webhook.interaction.resend';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

abstract class ResendError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ResendError';
  }
}

class ConfessionNotFoundResendError extends ResendError {
  constructor(public confessionId: bigint) {
    super(`Confession #${confessionId} does not exist in this channel.`);
    this.name = 'ConfessionNotFoundResendError';
  }
}

class InsufficientPermissionsResendError extends ResendError {
  constructor() {
    super('You do not have the permission to resend confessions with attachments in this channel.');
    this.name = 'InsufficientPermissionsResendError';
  }
}

class PendingApprovalResendError extends ResendError {
  constructor(public confessionId: bigint) {
    super(`Confession #${confessionId} has not yet been approved for publication in this channel.`);
    this.name = 'PendingApprovalResendError';
  }
}

class MissingLogChannelResendError extends ResendError {
  constructor() {
    super(
      'You cannot resend confessions until a valid confession log channel has been configured.',
    );
    this.name = 'MissingLogChannelResendError';
  }
}

/**
 * @throws {ConfessionNotFoundResendError}
 * @throws {InsufficientPermissionsResendError}
 * @throws {PendingApprovalResendError}
 * @throws {MissingLogChannelResendError}
 */
async function resendConfession(
  timestamp: Date,
  permission: bigint,
  confessionChannelId: Snowflake,
  confessionId: bigint,
  moderatorId: Snowflake,
) {
  return await tracer.asyncSpan('resend-confession', async span => {
    span.setAttributes({
      'channel.id': confessionChannelId.toString(),
      'confession.id': confessionId.toString(),
      'moderator.id': moderatorId.toString(),
    });

    const [result, ...others] = await db
      .select({
        logChannelId: channel.logChannelId,
        label: channel.label,
        color: channel.color,
        parentMessageId: confession.parentMessageId,
        authorId: confession.authorId,
        createdAt: confession.createdAt,
        content: confession.content,
        approvedAt: confession.approvedAt,
        retrievedAttachment: {
          attachmentUrl: attachment.url,
          attachmentFilename: attachment.filename,
          attachmentType: attachment.contentType,
        },
      })
      .from(confession)
      .innerJoin(channel, eq(confession.channelId, channel.id))
      .leftJoin(attachment, eq(confession.attachmentId, attachment.id))
      .where(
        and(
          eq(confession.channelId, confessionChannelId),
          eq(confession.confessionId, confessionId),
        ),
      )
      .limit(1);
    strictEqual(others.length, 0);

    if (typeof result === 'undefined') throw new ConfessionNotFoundResendError(confessionId);
    const {
      parentMessageId,
      authorId,
      approvedAt,
      createdAt,
      content,
      logChannelId,
      label,
      color,
      retrievedAttachment,
    } = result;
    const hex = color === null ? void 0 : Number.parseInt(color, 2);

    logger.debug('confession found', {
      label: result.label,
      'author.id': result.authorId.toString(),
    });

    if (approvedAt === null) throw new PendingApprovalResendError(confessionId);
    if (logChannelId === null) throw new MissingLogChannelResendError();

    let embedAttachment: EmbedAttachment | null = null;
    if (retrievedAttachment !== null) {
      if (!hasAllPermissions(permission, ATTACH_FILES))
        throw new InsufficientPermissionsResendError();
      embedAttachment = {
        filename: retrievedAttachment.attachmentFilename,
        url: retrievedAttachment.attachmentUrl,
        content_type: retrievedAttachment.attachmentType ?? void 0,
      };
    }

    logger.debug('confession resend submitted');

    // Promise is ignored so that it runs in the background
    void doDeferredResponse(async () => {
      const message = await dispatchConfessionViaHttp(
        createdAt,
        confessionChannelId,
        confessionId,
        label,
        hex,
        content,
        parentMessageId,
        embedAttachment,
      );

      if (typeof message === 'number')
        switch (message) {
          case DiscordErrorCode.MissingAccess:
            return 'Spectro does not have the permission to resend confessions to this channel.';
          default:
            throw new UnexpectedDiscordErrorCode(message);
        }

      logger.debug('confession resent to channel');
      const discordErrorCode = await logResentConfessionViaHttp(
        timestamp,
        logChannelId,
        confessionId,
        authorId,
        moderatorId,
        label,
        content,
        embedAttachment,
      );

      if (typeof discordErrorCode === 'number')
        switch (discordErrorCode) {
          case DiscordErrorCode.UnknownChannel:
            if (await resetLogChannel(db, confessionChannelId))
              logger.error('log channel reset due to unknown channel');
            else logger.warn('log channel previously reset due to unknown channel');
            return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession because the log channel had been deleted.`;
          case DiscordErrorCode.MissingAccess:
            logger.warn('insufficient channel permissions for the log channel');
            return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession due to insufficient log channel permissions.`;
          default:
            logger.error('unexpected error code when logging resent confession', void 0, {
              'discord.error.code': discordErrorCode,
            });
            return `${label} #${confessionId} has been resent, but Spectro couldn't log the confession due to an unexpected error (${discordErrorCode}) from Discord. You can retry this command later to ensure that it's properly logged.`;
        }

      logger.debug('resent confession logged');
      return `${label} #${confessionId} has been resent.`;
    });

    logger.info('confession resent', { 'confession.id': confessionId.toString() });
    return `${label} #${confessionId} has been submitted as a resent confession.`;
  });
}

export async function handleResend(
  timestamp: Date,
  permission: bigint,
  channelId: Snowflake,
  moderatorId: Snowflake,
  [option, ...options]: InteractionApplicationCommandChatInputOption[],
) {
  strictEqual(options.length, 0);
  strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.Integer);
  strictEqual(option.name, 'confession');

  const confessionId = BigInt(option.value);
  try {
    return await resendConfession(timestamp, permission, channelId, confessionId, moderatorId);
  } catch (err) {
    if (err instanceof ResendError) {
      logger.error(err.message, err);
      return err.message;
    }
    throw err;
  }
}
