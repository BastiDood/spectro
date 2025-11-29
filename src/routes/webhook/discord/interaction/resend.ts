import { strictEqual } from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { attachment, channel, confession } from '$lib/server/database/models';
import { db } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';

import { ATTACH_FILES } from '$lib/server/models/discord/permission';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { hasAllPermissions } from './util';

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
  interactionToken: string,
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
        internalId: confession.internalId,
        logChannelId: channel.logChannelId,
        label: channel.label,
        approvedAt: confession.approvedAt,
        retrievedAttachment: {
          attachmentUrl: attachment.url,
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
    const { internalId, approvedAt, logChannelId, label, retrievedAttachment } = result;

    logger.debug('confession found', {
      label: result.label,
      'internal.id': result.internalId.toString(),
    });

    if (approvedAt === null) throw new PendingApprovalResendError(confessionId);
    if (logChannelId === null) throw new MissingLogChannelResendError();

    // Check permission if attachment exists
    if (retrievedAttachment !== null && !hasAllPermissions(permission, ATTACH_FILES))
      throw new InsufficientPermissionsResendError();

    // Emit Inngest event for async processing (fans out to post-confession + log-confession)
    const { ids } = await inngest.send({
      name: 'discord/confession.submit',
      data: {
        interactionToken,
        internalId: internalId.toString(),
        moderatorId: moderatorId.toString(),
      },
    });
    logger.debug('inngest event emitted', { 'inngest.events.id': ids });

    logger.info('confession resend submitted', { 'confession.id': confessionId.toString() });
    return `${label} #${confessionId} has been submitted for resend.`;
  });
}

export async function handleResend(
  interactionToken: string,
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
    return await resendConfession(
      interactionToken,
      permission,
      channelId,
      confessionId,
      moderatorId,
    );
  } catch (err) {
    if (err instanceof ResendError) {
      logger.error(err.message, err);
      return err.message;
    }
    throw err;
  }
}
