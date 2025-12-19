import { strictEqual } from 'node:assert/strict';

import { and, eq } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';

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

  static throwNew(confessionId: bigint): never {
    const error = new ConfessionNotFoundResendError(confessionId);
    logger.error('confession not found for resend', error);
    throw error;
  }
}

class InsufficientPermissionsResendError extends ResendError {
  constructor() {
    super('You do not have the permission to resend confessions with attachments in this channel.');
    this.name = 'InsufficientPermissionsResendError';
  }

  static throwNew(permissions: bigint): never {
    const error = new InsufficientPermissionsResendError();
    logger.error('insufficient permissions for resend with attachment', error, {
      'error.permissions': permissions.toString(),
    });
    throw error;
  }
}

class PendingApprovalResendError extends ResendError {
  constructor(public confessionId: bigint) {
    super(`Confession #${confessionId} has not yet been approved for publication in this channel.`);
    this.name = 'PendingApprovalResendError';
  }

  static throwNew(confessionId: bigint): never {
    const error = new PendingApprovalResendError(confessionId);
    logger.error('confession pending approval for resend', error);
    throw error;
  }
}

class MissingLogChannelResendError extends ResendError {
  constructor() {
    super(
      'You cannot resend confessions until a valid confession log channel has been configured.',
    );
    this.name = 'MissingLogChannelResendError';
  }

  static throwNew(): never {
    const error = new MissingLogChannelResendError();
    logger.error('missing log channel for resend', error);
    throw error;
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

    const result = await tracer.asyncSpan('select-confession-for-resend', async span => {
      span.setAttributes({
        'channel.id': confessionChannelId.toString(),
        'confession.id': confessionId.toString(),
      });

      const row = await db
        .select({
          internalId: confession.internalId,
          logChannelId: channel.logChannelId,
          label: channel.label,
          approvedAt: confession.approvedAt,
          retrievedAttachment: { attachmentUrl: attachment.url },
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

      if (typeof row === 'undefined') logger.warn('confession not found for resend');
      else
        logger.debug('confession found for resend', {
          label: row.label,
          'internal.id': row.internalId.toString(),
        });

      return row;
    });

    if (typeof result === 'undefined') ConfessionNotFoundResendError.throwNew(confessionId);
    const { internalId, approvedAt, logChannelId, retrievedAttachment } = result;

    if (approvedAt === null) PendingApprovalResendError.throwNew(confessionId);

    if (logChannelId === null) MissingLogChannelResendError.throwNew();

    // Check permission if attachment exists
    if (retrievedAttachment !== null && !hasAllPermissions(permission, ATTACH_FILES))
      InsufficientPermissionsResendError.throwNew(permission);

    // Emit Inngest event for async processing (fans out to post-confession + log-confession)
    waitUntil(
      inngest
        .send({
          name: 'discord/confession.submit',
          data: {
            applicationId,
            interactionToken,
            internalId: internalId.toString(),
            moderatorId: moderatorId.toString(),
          },
        })
        .then(({ ids }) =>
          logger.debug('confession resend submitted', {
            'inngest.events.id': ids,
            'confession.id': confessionId.toString(),
          }),
        ),
    );
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
  } catch (error) {
    if (error instanceof ResendError)
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: error.message },
      };
    throw error;
  }

  return {
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  };
}
