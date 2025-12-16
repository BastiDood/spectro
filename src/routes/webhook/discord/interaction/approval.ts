import assert, { strictEqual } from 'node:assert/strict';

import { eq } from 'drizzle-orm';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MANAGE_MESSAGES } from '$lib/server/models/discord/permission';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type {
  ContainerChildComponent,
  MessageComponent,
} from '$lib/server/models/discord/message/component';

import { Color } from '$lib/server/constants';
import { attachment, channel, confession } from '$lib/server/database/models';
import { db } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';

import { hasAllPermissions } from './util';
import { MalformedCustomIdFormat } from './errors';

const SERVICE_NAME = 'webhook.interaction.approval';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

abstract class ApprovalError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ApprovalError';
  }
}

class InsufficientPermissionsApprovalError extends ApprovalError {
  constructor() {
    super('You need the **"Manage Messages"** permission to approve/reject confessions.');
    this.name = 'InsufficientPermissionsApprovalError';
  }

  static throwNew(logger: Logger, permissions: bigint): never {
    const error = new InsufficientPermissionsApprovalError();
    logger.error('insufficient permissions for approval', error, {
      'error.permissions': permissions.toString(),
    });
    throw error;
  }
}

class DisabledChannelConfessError extends ApprovalError {
  constructor(public disabledAt: Date) {
    const timestamp = Math.floor(disabledAt.valueOf() / 1000);
    super(`The confession channel has been temporarily disabled since <t:${timestamp}:R>.`);
    this.name = 'DisabledChannelConfessError';
  }

  static throwNew(logger: Logger, disabledAt: Date): never {
    const error = new DisabledChannelConfessError(disabledAt);
    logger.error('channel disabled for approval', error, {
      'error.disabled.at': disabledAt.toISOString(),
    });
    throw error;
  }
}

class AlreadyApprovedApprovalError extends ApprovalError {
  constructor(public approvedAt: Date) {
    const timestamp = Math.floor(approvedAt.valueOf() / 1000);
    super(`This confession has already been approved since <t:${timestamp}:R>.`);
    this.name = 'AlreadyApprovedApprovalError';
  }

  static throwNew(logger: Logger, approvedAt: Date): never {
    const error = new AlreadyApprovedApprovalError(approvedAt);
    logger.error('confession already approved', error, {
      'error.approved.at': approvedAt.toISOString(),
    });
    throw error;
  }
}

/**
 * @throws {InsufficientPermissionsApprovalError}
 * @throws {DisabledChannelConfessError}
 * @throws {AlreadyApprovedApprovalError}
 */
async function submitVerdict(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  isApproved: boolean,
  internalId: bigint,
  moderatorId: Snowflake,
  permissions: bigint,
) {
  return await tracer.asyncSpan('submit-verdict', async span => {
    span.setAttributes({
      timestamp: timestamp.toISOString(),
      'verdict.approved': isApproved,
      'confession.internal.id': internalId.toString(),
      'moderator.id': moderatorId,
      permissions: permissions.toString(),
    });

    if (!hasAllPermissions(permissions, MANAGE_MESSAGES))
      InsufficientPermissionsApprovalError.throwNew(logger, permissions);

    return await db.transaction(async tx => {
      const [details, ...rest] = await tx
        .select({
          disabledAt: channel.disabledAt,
          label: channel.label,
          authorId: confession.authorId,
          approvedAt: confession.approvedAt,
          content: confession.content,
          confessionId: confession.confessionId,
          attachmentId: confession.attachmentId,
        })
        .from(confession)
        .innerJoin(channel, eq(confession.channelId, channel.id))
        .where(eq(confession.internalId, internalId))
        .limit(1)
        .for('update');
      strictEqual(rest.length, 0);
      assert(typeof details !== 'undefined');
      const { approvedAt, disabledAt, authorId, confessionId, label, content, attachmentId } =
        details;

      // TODO: Refactor to Relations API once the `bigint` bug is fixed.
      let retrievedAttachment: { url: string; contentType: string | null } | null = null;
      if (attachmentId !== null) {
        const [retrieved, ...others] = await tx
          .select({
            contentType: attachment.contentType,
            url: attachment.url,
          })
          .from(attachment)
          .where(eq(attachment.id, attachmentId));
        strictEqual(others.length, 0);
        assert(typeof retrieved !== 'undefined');
        retrievedAttachment = retrieved;
      }

      logger.debug('confession details fetched', {
        'confession.id': details.confessionId.toString(),
        label: details.label,
      });

      if (disabledAt !== null && disabledAt <= timestamp)
        DisabledChannelConfessError.throwNew(logger, disabledAt);

      if (approvedAt !== null) AlreadyApprovedApprovalError.throwNew(logger, approvedAt);

      if (isApproved) {
        const { rowCount } = await tx
          .update(confession)
          .set({ approvedAt: timestamp })
          .where(eq(confession.internalId, internalId));
        strictEqual(rowCount, 1);

        // Emit Inngest event for async dispatch (will send follow-up on failure)
        const { ids } = await inngest.send({
          name: 'discord/confession.approve',
          data: {
            applicationId,
            interactionToken,
            internalId: internalId.toString(),
          },
        });
        logger.debug('inngest event emitted', { 'inngest.events.id': ids });

        const unixTimestamp = Math.floor(timestamp.valueOf() / 1000);

        // Build container children
        const containerChildren: ContainerChildComponent[] = [
          {
            type: MessageComponentType.TextDisplay,
            content: `# ${label} #${confessionId}`,
          },
          {
            type: MessageComponentType.TextDisplay,
            content,
          },
        ];

        // Add image as MediaGallery
        if (retrievedAttachment !== null && retrievedAttachment.contentType?.startsWith('image/'))
          containerChildren.push({
            type: MessageComponentType.MediaGallery,
            items: [{ media: { url: retrievedAttachment.url } }],
          });

        // Build metadata text
        let metadataText = `**Authored by:** ||<@${authorId}>|| \u{2022} **Approved by:** <@${moderatorId}>`;
        if (retrievedAttachment !== null)
          metadataText += `\n**Attachment:** ${retrievedAttachment.url}`;

        containerChildren.push(
          {
            type: MessageComponentType.Separator,
            divider: true,
          },
          {
            type: MessageComponentType.TextDisplay,
            content: metadataText,
          },
          {
            type: MessageComponentType.TextDisplay,
            content: `-# Spectro Logs \u{2022} <t:${unixTimestamp}:R>`,
          },
        );

        const components: MessageComponent[] = [
          {
            type: MessageComponentType.Container,
            accent_color: Color.Success,
            components: containerChildren,
          },
        ];

        logger.info('confession approved', { 'confession.id': confessionId.toString() });
        return { flags: MessageFlags.IsComponentsV2, components };
      }

      await tx.delete(confession).where(eq(confession.internalId, internalId));

      const unixTimestamp = Math.floor(timestamp.valueOf() / 1000);

      // Build container children
      const containerChildren: ContainerChildComponent[] = [
        {
          type: MessageComponentType.TextDisplay,
          content: `# ${label} #${confessionId}`,
        },
        {
          type: MessageComponentType.TextDisplay,
          content,
        },
      ];

      // Add image as MediaGallery
      if (retrievedAttachment !== null && retrievedAttachment.contentType?.startsWith('image/'))
        containerChildren.push({
          type: MessageComponentType.MediaGallery,
          items: [{ media: { url: retrievedAttachment.url } }],
        });

      // Build metadata text
      let metadataText = `**Authored by:** ||<@${authorId}>|| \u{2022} **Deleted by:** <@${moderatorId}>`;
      if (retrievedAttachment !== null)
        metadataText += `\n**Attachment:** ${retrievedAttachment.url}`;

      containerChildren.push(
        {
          type: MessageComponentType.Separator,
          divider: true,
        },
        {
          type: MessageComponentType.TextDisplay,
          content: metadataText,
        },
        {
          type: MessageComponentType.TextDisplay,
          content: `-# Spectro Logs \u{2022} <t:${unixTimestamp}:R>`,
        },
      );

      const components: MessageComponent[] = [
        {
          type: MessageComponentType.Container,
          accent_color: Color.Failure,
          components: containerChildren,
        },
      ];

      logger.info('confession rejected', { 'confession.id': confessionId.toString() });
      return { flags: MessageFlags.IsComponentsV2, components };
    });
  });
}

export async function handleApproval(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  customId: string,
  userId: Snowflake,
  permissions: bigint,
): Promise<InteractionResponse> {
  const [key, id, ...rest] = customId.split(':');
  strictEqual(rest.length, 0);
  assert(typeof id !== 'undefined');
  const internalId = BigInt(id);
  assert(typeof key !== 'undefined');

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let isApproved: boolean;
  switch (key) {
    case 'publish':
      isApproved = true;
      break;
    case 'delete':
      isApproved = false;
      break;
    default:
      MalformedCustomIdFormat.throwNew(key);
  }

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let data: { flags: MessageFlags; components: MessageComponent[] };
  try {
    data = await submitVerdict(
      timestamp,
      applicationId,
      interactionToken,
      isApproved,
      internalId,
      userId,
      permissions,
    );
  } catch (err) {
    if (err instanceof ApprovalError)
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: err.message },
      };
    throw err;
  }

  return {
    type: InteractionResponseType.UpdateMessage,
    data,
  };
}
