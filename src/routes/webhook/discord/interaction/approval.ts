import assert, { strictEqual } from 'node:assert/strict';

import { aliasedTable, eq } from 'drizzle-orm';

import { APP_ICON_URL, Color } from '$lib/server/constants';
import { assertSingle } from '$lib/assert';
import {
  channel,
  confession,
  durableAttachment,
  ephemeralAttachment,
  pendingChannelThread,
} from '$lib/server/database/models';
import { ConfessionApprovalEvent } from '$lib/server/inngest/functions/dispatch-approval/schema';
import type { CreateMessageAttachment } from '$lib/server/models/discord/message';
import { db } from '$lib/server/database';
import { type Embed, EmbedField, EmbedImage, EmbedType } from '$lib/server/models/discord/embed';
import { hasAllFlags } from '$lib/bits';
import { inngest } from '$lib/server/inngest/client';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { Logger } from '$lib/server/telemetry/logger';
import { MANAGE_MESSAGES } from '$lib/server/models/discord/permission';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

import { MalformedCustomIdFormat } from './errors';

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
      'This legacy confession includes an attachment that is no longer available in the Discord CDN, so it cannot be approved.',
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
  attachment: ApprovalVerdictAttachment | null;
  dispatch: ApprovalDispatch | null;
}

interface ApprovalVerdictAttachment {
  id: string;
  filename: string;
  contentType: string | null;
  url: string;
  height: number | null;
  width: number | null;
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
): Promise<SubmitVerdictResult> {
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
        const result = await tracer.asyncSpan('select-confession-details', async span => {
          span.setAttribute('confession.internal.id', internalId.toString());

          const lockedConfession = aliasedTable(confession, 'confession');
          const result = await tx
            .select({
              disabledAt: channel.disabledAt,
              label: channel.label,
              authorId: lockedConfession.authorId,
              approvedAt: lockedConfession.approvedAt,
              content: lockedConfession.content,
              confessionId: lockedConfession.confessionId,
              ephemeralAttachmentId: ephemeralAttachment.id,
              durableAttachmentId: durableAttachment.id,
              attachmentFilename: durableAttachment.filename,
              attachmentContentType: durableAttachment.contentType,
              attachmentUrl: durableAttachment.url,
              attachmentHeight: durableAttachment.height,
              attachmentWidth: durableAttachment.width,
              threadTitle: pendingChannelThread.title,
            })
            .from(lockedConfession)
            .innerJoin(channel, eq(lockedConfession.channelId, channel.id))
            .leftJoin(
              pendingChannelThread,
              eq(lockedConfession.pendingChannelThreadId, pendingChannelThread.id),
            )
            .leftJoin(
              ephemeralAttachment,
              eq(lockedConfession.internalId, ephemeralAttachment.confessionInternalId),
            )
            .leftJoin(
              durableAttachment,
              eq(ephemeralAttachment.id, durableAttachment.ephemeralAttachmentId),
            )
            .where(eq(lockedConfession.internalId, internalId))
            .limit(1)
            .for('update', { of: lockedConfession })
            .then(assertSingle);

          logger.debug('confession details fetched', {
            'confession.id': result.confessionId.toString(),
            label: result.label,
          });

          return result;
        });
        const { approvedAt, disabledAt, authorId, confessionId, label, content } = result;

        let embedAttachment: ApprovalVerdictAttachment | null = null;
        if (result.ephemeralAttachmentId !== null)
          if (result.durableAttachmentId === null) {
            if (isApproved) MissingDurableAttachmentApprovalError.throwNew();
            else
              logger.warn('durable attachment missing for rejected confession', {
                'attachment.id': result.ephemeralAttachmentId.toString(),
              });
          } else {
            assert(result.attachmentFilename !== null);
            assert(result.attachmentUrl !== null);
            logger.debug('attachment fetched', {
              'attachment.filename': result.attachmentFilename,
            });

            embedAttachment = {
              id: result.durableAttachmentId.toString(),
              filename: result.attachmentFilename,
              contentType: result.attachmentContentType,
              url: result.attachmentUrl,
              height: result.attachmentHeight,
              width: result.attachmentWidth,
            };
          }

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

          if (result.threadTitle !== null)
            fields.push({ name: 'Thread Title', value: result.threadTitle, inline: true });

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let image: EmbedImage | undefined;
          if (embedAttachment !== null)
            if (embedAttachment.contentType?.startsWith('image/') === true)
              image = {
                url: `attachment://${embedAttachment.filename}`,
                height: embedAttachment.height ?? void 0,
                width: embedAttachment.width ?? void 0,
              };

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

          if (result.threadTitle !== null)
            fields.push({ name: 'Thread Title', value: result.threadTitle, inline: true });

          // eslint-disable-next-line @typescript-eslint/init-declarations
          let image: EmbedImage | undefined;
          if (embedAttachment !== null)
            if (embedAttachment.contentType?.startsWith('image/') === true)
              image = {
                url: `attachment://${embedAttachment.filename}`,
                height: embedAttachment.height ?? void 0,
                width: embedAttachment.width ?? void 0,
              };

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

        return { embed, attachment: embedAttachment, dispatch };
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

  const attachments: CreateMessageAttachment[] = [];
  if (result.attachment !== null)
    attachments.push({ id: result.attachment.id, filename: result.attachment.filename });

  return {
    type: InteractionResponseType.UpdateMessage,
    data: { components: [], embeds: [result.embed], attachments },
  };
}
