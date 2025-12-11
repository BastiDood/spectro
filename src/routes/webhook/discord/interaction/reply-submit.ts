import assert, { strictEqual } from 'node:assert/strict';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { db, insertConfession } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';

import { assertDefined } from '$lib/assert';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponents } from '$lib/server/models/discord/message/component';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { SEND_MESSAGES } from '$lib/server/models/discord/permission';

import { hasAllPermissions } from './util';

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
  interactionToken: string,
  permissions: bigint,
  confessionChannelId: Snowflake,
  parentMessageId: Snowflake,
  authorId: Snowflake,
  content: string,
) {
  return await tracer.asyncSpan('submit-reply', async span => {
    span.setAttributes({
      'channel.id': confessionChannelId,
      'author.id': authorId,
      'parent.message.id': parentMessageId,
    });

    if (!hasAllPermissions(permissions, SEND_MESSAGES)) {
      const error = new InsufficientPermissionsReplySubmitError();
      logger.error('insufficient permissions for reply submit', error, {
        permissions: permissions.toString(),
      });
      throw error;
    }

    const channel = await db.query.channel
      .findFirst({
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
      })
      .then(assertDefined);

    const { logChannelId, guildId, disabledAt, isApprovalRequired } = channel;

    logger.debug('channel found', {
      'guild.id': channel.guildId.toString(),
      label: channel.label,
      'approval.required': channel.isApprovalRequired,
    });

    if (disabledAt !== null && disabledAt <= timestamp) {
      logger.warn('channel disabled for reply submit', {
        'disabled.at': disabledAt.toISOString(),
      });
      throw new DisabledChannelReplySubmitError(disabledAt);
    }
    if (logChannelId === null) {
      const error = new MissingLogChannelReplySubmitError();
      logger.error('missing log channel for reply submit', error);
      throw error;
    }

    // Insert reply to database
    const { internalId, confessionId } = await db.transaction(
      async tx =>
        await insertConfession(
          tx,
          timestamp,
          guildId,
          BigInt(confessionChannelId),
          BigInt(authorId),
          content,
          isApprovalRequired ? null : timestamp,
          BigInt(parentMessageId),
          null,
          true,
        ),
    );

    logger.debug('reply inserted', {
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

    logger.info(isApprovalRequired ? 'reply pending approval' : 'reply submitted', {
      'inngest.events.id': ids,
      'confession.id': confessionId.toString(),
    });
  });
}

export async function handleReplySubmit(
  timestamp: Date,
  interactionToken: string,
  channelId: Snowflake,
  authorId: Snowflake,
  permissions: bigint,
  [row, ...otherRows]: MessageComponents,
): Promise<InteractionResponse> {
  strictEqual(otherRows.length, 0);
  assert(typeof row !== 'undefined');

  const [component, ...otherComponents] = row.components;
  strictEqual(otherComponents.length, 0);
  assert(typeof component !== 'undefined');

  strictEqual(component?.type, MessageComponentType.TextInput);
  assert(typeof component.value !== 'undefined');
  const parentMessageId = component.custom_id;

  try {
    await submitReply(
      timestamp,
      interactionToken,
      permissions,
      channelId,
      parentMessageId,
      authorId,
      component.value,
    );
  } catch (err) {
    if (err instanceof ReplySubmitError) {
      logger.error(err.message, err);
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: err.message },
      };
    }
    throw err;
  }

  return {
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  };
}
