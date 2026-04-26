import assert, { strictEqual } from 'node:assert/strict';

import { eq } from 'drizzle-orm';

import { hasAllFlags } from '$lib/bits';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { type Embed, EmbedField, EmbedImage, EmbedType } from '$lib/server/models/discord/embed';
import type { EmbedAttachment } from '$lib/server/models/discord/attachment';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MANAGE_MESSAGES } from '$lib/server/models/discord/permission';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { APP_ICON_URL, Color } from '$lib/server/constants';
import {
  channel,
  confession,
  durableAttachment,
  ephemeralAttachment,
} from '$lib/server/database/models';
import { ConfessionApprovalEvent } from '$lib/server/inngest/functions/dispatch-approval/schema';
import { db } from '$lib/server/database';
import { inngest } from '$lib/server/inngest/client';

import { MalformedCustomIdFormat } from './errors';
import { assertSingle } from '$lib/assert';

const SERVICE_NAME = 'webhook.interaction.approval';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

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

  static throwNew(): never {
    const error = new InsufficientPermissionsApprovalError();
    logger.fatal('insufficient permissions for approval', error);
    throw error;
  }
}

class DisabledChannelConfessError extends ApprovalError {
  constructor(public disabledAt: Date) {
    const timestamp = Math.floor(disabledAt.valueOf() / 1000);
    super(`The confession channel has been temporarily disabled since <t:${timestamp}:R>.`);
    this.name = 'DisabledChannelConfessError';
  }

  static throwNew(disabledAt: Date): never {
    const error = new DisabledChannelConfessError(disabledAt);
    logger.fatal('channel disabled for approval', error, {
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

  static throwNew(approvedAt: Date): never {
    const error = new AlreadyApprovedApprovalError(approvedAt);
    logger.fatal('confession already approved', error, {
      'error.approved.at': approvedAt.toISOString(),
    });
    throw error;
  }
}

class MissingDurableAttachmentApprovalError extends ApprovalError {
  constructor() {
    super(
      'This legacy confession includes an attachment that is no longer available in the Discord CDN, so it cannot be approved or rejected.',
    );
    this.name = 'MissingDurableAttachmentApprovalError';
  }

  static throwNew(): never {
    const error = new MissingDurableAttachmentApprovalError();
    logger.fatal('missing durable attachment for approval', error);
    throw error;
  }
}

interface ApprovalDispatch {
  applicationId: Snowflake;
  interactionToken: string;
  interactionId: Snowflake;
  internalId: string;
}

interface SubmitVerdictResult {
  embed: Embed;
  dispatch: ApprovalDispatch | null;
}

/**
 * @throws {InsufficientPermissionsApprovalError}
 * @throws {DisabledChannelConfessError}
 * @throws {AlreadyApprovedApprovalError}
 * @throws {MissingDurableAttachmentApprovalError}
 */
async function submitVerdict(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
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

    if (!hasAllFlags(permissions, MANAGE_MESSAGES)) InsufficientPermissionsApprovalError.throwNew();

    return await db.transaction(
      async tx => {
        const { approvedAt, disabledAt, authorId, confessionId, label, content, attachmentId } =
          await tracer.asyncSpan('select-confession-details', async span => {
            span.setAttribute('confession.internal.id', internalId.toString());

            const [result, ...rest] = await tx
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
            assert(typeof result !== 'undefined');

            logger.debug('confession details fetched', {
              'confession.id': result.confessionId.toString(),
              label: result.label,
            });

            return result;
          });

        // TODO: Refactor to Relations API once the `bigint` bug is fixed.
        let embedAttachment: EmbedAttachment | null = null;
        if (attachmentId !== null)
          embedAttachment = await tracer.asyncSpan('select-attachment', async span => {
            span.setAttribute('attachment.id', attachmentId.toString());

            const retrieved = await tx
              .select({
                durableAttachmentId: durableAttachment.id,
                filename: durableAttachment.filename,
                contentType: durableAttachment.contentType,
                url: durableAttachment.url,
                height: durableAttachment.height,
                width: durableAttachment.width,
              })
              .from(ephemeralAttachment)
              .leftJoin(
                durableAttachment,
                eq(ephemeralAttachment.durableAttachmentId, durableAttachment.id),
              )
              .where(eq(ephemeralAttachment.id, attachmentId))
              .then(assertSingle);

            if (retrieved.durableAttachmentId === null) {
              if (!isApproved) {
                logger.warn('durable attachment missing for rejected confession', {
                  'attachment.id': attachmentId.toString(),
                });
                return null;
              }
              MissingDurableAttachmentApprovalError.throwNew();
            }

            assert(retrieved.filename !== null);
            assert(retrieved.url !== null);
            logger.debug('attachment fetched', { 'attachment.filename': retrieved.filename });

            const embed: EmbedAttachment = { filename: retrieved.filename, url: retrieved.url };
            if (retrieved.contentType !== null) embed.content_type = retrieved.contentType;
            if (retrieved.height !== null) embed.height = retrieved.height;
            if (retrieved.width !== null) embed.width = retrieved.width;
            return embed;
          });

        if (disabledAt !== null && disabledAt <= timestamp)
          DisabledChannelConfessError.throwNew(disabledAt);

        if (approvedAt !== null) AlreadyApprovedApprovalError.throwNew(approvedAt);

        const fields: EmbedField[] = [
          {
            name: 'Authored by',
            value: `||<@${authorId}>||`,
            inline: true,
          },
        ];

        // eslint-disable-next-line @typescript-eslint/init-declarations
        let embed: Embed;
        let dispatch: ApprovalDispatch | null = null;
        if (isApproved) {
          await tracer.asyncSpan('update-confession-approved-at', async span => {
            span.setAttribute('confession.internal.id', internalId.toString());
            const { rowCount } = await tx
              .update(confession)
              .set({ approvedAt: timestamp })
              .where(eq(confession.internalId, internalId));
            strictEqual(rowCount, 1);
            logger.debug('confession approved_at updated');
          });

          fields.push({
            name: 'Approved by',
            value: `<@${moderatorId}>`,
            inline: true,
          });

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let image: EmbedImage | undefined;
          if (embedAttachment !== null) {
            fields.push({ name: 'Attachment', value: embedAttachment.url, inline: true });
            if (embedAttachment.content_type?.startsWith('image/'))
              image = {
                url: embedAttachment.url,
                height: embedAttachment.height ?? void 0,
                width: embedAttachment.width ?? void 0,
              };
          }

          logger.info('confession approved', { 'confession.id': confessionId.toString() });
          embed = {
            type: EmbedType.Rich,
            title: `${label} #${confessionId}`,
            color: Color.Success,
            timestamp: timestamp.toISOString(),
            description: content,
            footer: {
              text: 'Spectro Logs',
              icon_url: APP_ICON_URL,
            },
            fields,
            image,
          };
          dispatch = {
            applicationId,
            interactionToken,
            interactionId,
            internalId: internalId.toString(),
          };
        } else {
          fields.push({
            name: 'Deleted by',
            value: `<@${moderatorId}>`,
            inline: true,
          });

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let image: EmbedImage | undefined;
          if (embedAttachment !== null) {
            fields.push({ name: 'Attachment', value: embedAttachment.url, inline: true });
            if (embedAttachment.content_type?.startsWith('image/'))
              image = {
                url: embedAttachment.url,
                height: embedAttachment.height ?? void 0,
                width: embedAttachment.width ?? void 0,
              };
          }

          await tracer.asyncSpan('delete-confession', async span => {
            span.setAttribute('confession.internal.id', internalId.toString());
            const { rowCount } = await tx
              .delete(confession)
              .where(eq(confession.internalId, internalId));
            strictEqual(rowCount, 1);
            logger.info('confession rejected', { 'confession.id': confessionId.toString() });
          });

          embed = {
            type: EmbedType.Rich,
            title: `${label} #${confessionId}`,
            color: Color.Failure,
            timestamp: timestamp.toISOString(),
            description: content,
            footer: {
              text: 'Spectro Logs',
              icon_url: APP_ICON_URL,
            },
            fields,
            image,
          };
        }

        return { embed, dispatch } satisfies SubmitVerdictResult;
      },
      { isolationLevel: 'read committed' },
    );
  });
}

export async function handleApproval(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
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
  let result: SubmitVerdictResult;
  try {
    result = await submitVerdict(
      timestamp,
      applicationId,
      interactionToken,
      interactionId,
      isApproved,
      internalId,
      userId,
      permissions,
    );
  } catch (error) {
    if (error instanceof ApprovalError)
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { flags: MessageFlags.Ephemeral, content: error.message },
      };
    throw error;
  }

  if (result.dispatch !== null) {
    const { dispatch } = result;
    await tracer.asyncSpan('send-approval-dispatch', async span => {
      span.setAttributes({
        'confession.internal.id': dispatch.internalId,
        'interaction.id': dispatch.interactionId,
      });

      const { ids } = await inngest.send(
        ConfessionApprovalEvent.create(
          {
            applicationId: dispatch.applicationId,
            interactionToken: dispatch.interactionToken,
            interactionId: dispatch.interactionId,
            internalId: dispatch.internalId,
          },
          { id: dispatch.interactionId, ts: timestamp.valueOf() },
        ),
      );
      logger.debug('inngest event emitted', { 'inngest.events.id': ids });
    });
  }

  return {
    type: InteractionResponseType.UpdateMessage,
    data: { components: [], embeds: [result.embed] },
  };
}
