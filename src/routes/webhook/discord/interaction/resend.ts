import { strictEqual } from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { attachment, channel, confession } from '$lib/server/database/models';
import { db } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';

import { assertOptional } from '$lib/assert';
import { ATTACH_FILES } from '$lib/server/models/discord/permission';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
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
  applicationId: Snowflake,
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

    const result = await db
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
          eq(confession.channelId, BigInt(confessionChannelId)),
          eq(confession.confessionId, confessionId),
        ),
      )
      .limit(1)
      .then(assertOptional);

    if (typeof result === 'undefined') {
      const error = new ConfessionNotFoundResendError(confessionId);
      logger.error('confession not found for resend', error);
      throw error;
    }

    const { internalId, approvedAt, logChannelId, retrievedAttachment } = result;

    logger.debug('confession found', {
      label: result.label,
      'internal.id': result.internalId.toString(),
    });

    if (approvedAt === null) {
      const error = new PendingApprovalResendError(confessionId);
      logger.error('confession pending approval for resend', error);
      throw error;
    }

    if (logChannelId === null) {
      const error = new MissingLogChannelResendError();
      logger.error('missing log channel for resend', error);
      throw error;
    }

    // Check permission if attachment exists
    if (retrievedAttachment !== null && !hasAllPermissions(permission, ATTACH_FILES)) {
      const error = new InsufficientPermissionsResendError();
      logger.error('insufficient permissions for resend with attachment', error);
      throw error;
    }

    // Emit Inngest event for async processing (fans out to post-confession + log-confession)
    const { ids } = await inngest.send({
      name: 'discord/confession.submit',
      data: {
        applicationId,
        interactionToken,
        internalId: internalId.toString(),
        moderatorId: moderatorId.toString(),
      },
    });

    logger.info('confession resend submitted', {
      'inngest.events.id': ids,
      'confession.id': confessionId.toString(),
    });
  });
}

export async function handleResend(
  applicationId: Snowflake,
  interactionToken: string,
  permission: bigint,
  channelId: Snowflake,
  moderatorId: Snowflake,
  [option, ...options]: InteractionApplicationCommandChatInputOption[],
): Promise<InteractionResponse> {
  strictEqual(options.length, 0);
  strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.Integer);
  strictEqual(option.name, 'confession');

  const confessionId = BigInt(option.value);
  try {
    await resendConfession(
      applicationId,
      interactionToken,
      permission,
      channelId,
      confessionId,
      moderatorId,
    );
  } catch (err) {
    if (err instanceof ResendError) {
      logger.error(err.message, err);
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: err.message },
      };
    }
    throw err;
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral, content: 'Resending confession...' },
  };
}
