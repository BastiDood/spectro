import { ATTACH_FILES, SEND_MESSAGES } from '$lib/server/models/discord/permission';
import { type InsertableAttachment, db, insertConfession } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';
import { Logger } from '$lib/server/telemetry/logger';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

import { hasAllPermissions } from './util';

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

  static throwNew(permissions: bigint): never {
    const error = new InsufficientPermissionsConfessionError();
    logger.error('insufficient attach files permission', error, {
      'error.permissions': permissions.toString(),
    });
    throw error;
  }
}

export class InsufficientSendMessagesConfessionError extends ConfessError {
  constructor() {
    super('Your **"Send Messages"** permission has since been revoked.');
    this.name = 'InsufficientSendMessagesConfessionError';
  }

  static throwNew(permissions: bigint): never {
    const error = new InsufficientSendMessagesConfessionError();
    logger.error('insufficient send messages permission', error, {
      'error.permissions': permissions.toString(),
    });
    throw error;
  }
}

export class UnknownChannelConfessError extends ConfessError {
  constructor() {
    super('This channel has not been set up for confessions yet.');
    this.name = 'UnknownChannelConfessError';
  }

  static throwNew(): never {
    const error = new UnknownChannelConfessError();
    logger.error('unknown confession channel', error);
    throw error;
  }
}

export class DisabledChannelConfessError extends ConfessError {
  constructor(public disabledAt: Date) {
    const timestamp = Math.floor(disabledAt.valueOf() / 1000);
    super(`This channel has temporarily disabled confessions since <t:${timestamp}:R>.`);
    this.name = 'DisabledChannelConfessError';
  }

  static throwNew(disabledAt: Date): never {
    const error = new DisabledChannelConfessError(disabledAt);
    logger.error('confession channel disabled', error, {
      'error.disabled.at': disabledAt.toISOString(),
    });
    throw error;
  }
}

export class MissingLogConfessError extends ConfessError {
  constructor() {
    super(
      'Spectro cannot submit confessions until the moderators have configured a confession log.',
    );
    this.name = 'MissingLogConfessError';
  }

  static throwNew(): never {
    const error = new MissingLogConfessError();
    logger.error('missing log channel for confession', error);
    throw error;
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
  applicationId: Snowflake,
  interactionToken: string,
  permission: bigint,
  confessionChannelId: Snowflake,
  authorId: Snowflake,
  description: string,
  attachment: InsertableAttachment | null,
  parentMessageId: Snowflake | null,
) {
  return await tracer.asyncSpan('submit-confession', async span => {
    span.setAttributes({ 'channel.id': confessionChannelId, 'author.id': authorId });

    if (attachment !== null)
      span.setAttributes({
        'attachment.id': attachment.id,
        'attachment.url': attachment.url,
        'attachment.proxy_url': attachment.proxy_url,
        'attachment.content_type': attachment.content_type,
        'attachment.filename': attachment.filename,
      });

    if (!hasAllPermissions(permission, SEND_MESSAGES))
      InsufficientSendMessagesConfessionError.throwNew(permission);

    if (attachment !== null && !hasAllPermissions(permission, ATTACH_FILES))
      InsufficientPermissionsConfessionError.throwNew(permission);

    const channel = await db.query.channel.findFirst({
      columns: {
        logChannelId: true,
        guildId: true,
        disabledAt: true,
        isApprovalRequired: true,
        label: true,
      },
      where({ id }, { eq }) {
        return eq(id, BigInt(confessionChannelId));
      },
    });

    if (typeof channel === 'undefined') UnknownChannelConfessError.throwNew();

    const { logChannelId, guildId, disabledAt, isApprovalRequired } = channel;

    logger.debug('channel found', {
      'guild.id': channel.guildId.toString(),
      label: channel.label,
      'approval.required': channel.isApprovalRequired,
    });

    if (disabledAt !== null && disabledAt <= timestamp)
      DisabledChannelConfessError.throwNew(disabledAt);

    if (logChannelId === null) MissingLogConfessError.throwNew();

    // Insert confession to database
    const { internalId, confessionId } = await db.transaction(
      async db =>
        await insertConfession(
          db,
          timestamp,
          guildId,
          BigInt(confessionChannelId),
          BigInt(authorId),
          description,
          isApprovalRequired ? null : timestamp, // approvedAt
          parentMessageId === null ? null : BigInt(parentMessageId),
          attachment,
        ),
    );

    logger.debug('confession inserted', {
      'internal.id': internalId.toString(),
      'confession.id': confessionId.toString(),
    });

    // Emit Inngest event for async processing (fan-out to post-confession and log-confession)
    const { ids } = await inngest.send({
      name: 'discord/confession.submit',
      data: {
        applicationId,
        interactionToken,
        internalId: internalId.toString(),
      },
    });

    logger.info(isApprovalRequired ? 'confession pending approval' : 'confession submitted', {
      'inngest.events.id': ids,
      'confession.id': confessionId.toString(),
    });
  });
}
