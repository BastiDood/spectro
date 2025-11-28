import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { ATTACH_FILES, SEND_MESSAGES } from '$lib/server/models/discord/permission';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type InsertableAttachment, db, insertConfession } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';

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
  interactionToken: string,
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
    });

    if (attachment !== null)
      span.setAttributes({
        'attachment.id': attachment.id.toString(),
        'attachment.url': attachment.url,
        'attachment.proxy_url': attachment.proxy_url,
        'attachment.content_type': attachment.content_type,
        'attachment.filename': attachment.filename,
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
      },
      where({ id }, { eq }) {
        return eq(id, confessionChannelId);
      },
    });

    if (typeof channel === 'undefined') throw new UnknownChannelConfessError();
    const { logChannelId, guildId, disabledAt, label, isApprovalRequired } = channel;

    logger.debug('channel found', {
      'guild.id': channel.guildId.toString(),
      label: channel.label,
      'approval.required': channel.isApprovalRequired,
    });

    if (disabledAt !== null && disabledAt <= timestamp)
      throw new DisabledChannelConfessError(disabledAt);
    if (logChannelId === null) throw new MissingLogConfessError();

    // Insert confession to database
    const { internalId, confessionId } = await db.transaction(
      async db =>
        await insertConfession(
          db,
          timestamp,
          guildId,
          confessionChannelId,
          authorId,
          description,
          isApprovalRequired ? null : timestamp, // approvedAt
          null, // parentMessageId
          attachment,
          shouldInsertAttachment,
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
        interactionToken,
        internalId: internalId.toString(),
      },
    });
    logger.debug('inngest event emitted', { 'inngest.events.id': ids });

    logger.info(isApprovalRequired ? 'confession pending approval' : 'confession submitted', {
      'confession.id': confessionId.toString(),
    });

    return `${label} #${confessionId} has been submitted.`;
  });
}
