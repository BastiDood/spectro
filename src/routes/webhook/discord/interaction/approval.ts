import { strictEqual } from 'node:assert/strict';

import { aliasedTable, eq } from 'drizzle-orm';

import { APP_ICON_URL, Color } from '$lib/server/constants';
import {
  approvedChannelThread,
  channel,
  confession,
  durableAttachment,
  ephemeralAttachment,
  pendingChannelThread,
  pendingChannelThreadTitle,
} from '$lib/server/database/models';
import { AssertionError, assertSingle } from '$lib/assert';
import { ConfessionApprovalEvent } from '$lib/server/inngest/functions/dispatch-approval/schema';
import type { CreateMessageAttachment } from '$lib/server/models/discord/message';
import { db, type Transaction } from '$lib/server/database';
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

interface ApprovalVerdictConfessionAttachment {
  ephemeralId: bigint;
  durable: ApprovalVerdictAttachment | null;
}

interface ApprovalVerdictThread {
  title: string;
  threadId: bigint | null;
}

interface ApprovalVerdictConfession {
  disabledAt: Date | null;
  label: string;
  guildId: bigint;
  channelId: bigint;
  authorId: bigint;
  approvedAt: Date | null;
  content: string;
  confessionId: bigint;
  parentMessageId: bigint | null;
  thread: ApprovalVerdictThread | null;
  attachment: ApprovalVerdictConfessionAttachment | null;
}

interface FlatApprovalVerdictConfessionRow {
  disabledAt: Date | null;
  label: string;
  guildId: bigint;
  channelId: bigint;
  authorId: bigint;
  approvedAt: Date | null;
  content: string;
  confessionId: bigint;
  parentMessageId: bigint | null;
  ephemeralAttachmentId: bigint | null;
  durableAttachmentId: bigint | null;
  attachmentFilename: string | null;
  attachmentContentType: string | null;
  attachmentUrl: string | null;
  attachmentHeight: number | null;
  attachmentWidth: number | null;
  pendingChannelThreadId: bigint | null;
  requestedThreadTitle: string | null;
  threadPendingChannelThreadId: bigint | null;
  threadParentMessageId: bigint | null;
  approvedPendingChannelThreadId: bigint | null;
  approvedThreadTitle: string | null;
  approvedThreadId: bigint | null;
}

type ApprovalVerdictAttachmentRow = Pick<
  FlatApprovalVerdictConfessionRow,
  | 'attachmentContentType'
  | 'attachmentFilename'
  | 'attachmentHeight'
  | 'attachmentUrl'
  | 'attachmentWidth'
  | 'durableAttachmentId'
  | 'ephemeralAttachmentId'
>;

type ApprovalVerdictThreadRow = Pick<
  FlatApprovalVerdictConfessionRow,
  | 'approvedPendingChannelThreadId'
  | 'approvedThreadId'
  | 'approvedThreadTitle'
  | 'pendingChannelThreadId'
  | 'requestedThreadTitle'
  | 'threadParentMessageId'
  | 'threadPendingChannelThreadId'
>;

function createApprovalVerdictAttachment(row: ApprovalVerdictAttachmentRow) {
  if (row.ephemeralAttachmentId === null) {
    if (row.durableAttachmentId !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan durable attachment');
    if (row.attachmentFilename !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan attachment filename');
    if (row.attachmentContentType !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan attachment content type');
    if (row.attachmentUrl !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan attachment url');
    if (row.attachmentHeight !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan attachment height');
    if (row.attachmentWidth !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan attachment width');
    return null;
  }

  if (row.durableAttachmentId === null) {
    if (row.attachmentFilename !== null)
      AssertionError.throwNew('invalid approval verdict row: durable filename without id');
    if (row.attachmentContentType !== null)
      AssertionError.throwNew('invalid approval verdict row: durable content type without id');
    if (row.attachmentUrl !== null)
      AssertionError.throwNew('invalid approval verdict row: durable url without id');
    if (row.attachmentHeight !== null)
      AssertionError.throwNew('invalid approval verdict row: durable height without id');
    if (row.attachmentWidth !== null)
      AssertionError.throwNew('invalid approval verdict row: durable width without id');
    return { ephemeralId: row.ephemeralAttachmentId, durable: null };
  }

  if (row.attachmentFilename === null)
    AssertionError.throwNew('invalid approval verdict row: durable attachment missing filename');
  if (row.attachmentUrl === null)
    AssertionError.throwNew('invalid approval verdict row: durable attachment missing url');

  return {
    ephemeralId: row.ephemeralAttachmentId,
    durable: {
      id: row.durableAttachmentId.toString(),
      filename: row.attachmentFilename,
      contentType: row.attachmentContentType,
      url: row.attachmentUrl,
      height: row.attachmentHeight,
      width: row.attachmentWidth,
    },
  };
}

function createApprovalVerdictThread(row: ApprovalVerdictThreadRow) {
  if (row.pendingChannelThreadId === null) {
    if (row.threadPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan pending thread row');
    if (row.threadParentMessageId !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan thread parent message');
    if (row.requestedThreadTitle !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan requested thread title');
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan approved thread owner');
    if (row.approvedThreadTitle !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan approved thread title');
    if (row.approvedThreadId !== null)
      AssertionError.throwNew('invalid approval verdict row: orphan approved thread id');
    return null;
  }

  if (row.threadPendingChannelThreadId === null)
    AssertionError.throwNew('invalid approval verdict row: pending thread row missing');
  if (row.threadPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid approval verdict row: pending thread id mismatch');
  if (row.requestedThreadTitle === null)
    AssertionError.throwNew('invalid approval verdict row: requested thread title missing');

  if (row.approvedThreadId === null) {
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid approval verdict row: approved owner without thread id');
    if (row.approvedThreadTitle !== null)
      AssertionError.throwNew('invalid approval verdict row: approved title without thread id');
    return {
      title: row.requestedThreadTitle,
      threadId: null,
    };
  }

  if (row.approvedPendingChannelThreadId === null)
    AssertionError.throwNew('invalid approval verdict row: approved thread owner missing');
  if (row.approvedPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid approval verdict row: approved thread owner mismatch');
  if (row.approvedThreadTitle === null)
    AssertionError.throwNew('invalid approval verdict row: approved thread title missing');

  return {
    title: row.requestedThreadTitle,
    threadId: row.approvedThreadId,
  };
}

function createApprovalVerdictConfession(
  row: FlatApprovalVerdictConfessionRow,
): ApprovalVerdictConfession {
  return {
    disabledAt: row.disabledAt,
    label: row.label,
    guildId: row.guildId,
    channelId: row.channelId,
    authorId: row.authorId,
    approvedAt: row.approvedAt,
    content: row.content,
    confessionId: row.confessionId,
    parentMessageId: row.parentMessageId,
    thread: createApprovalVerdictThread(row),
    attachment: createApprovalVerdictAttachment(row),
  };
}

async function loadApprovalVerdictConfession(tx: Transaction, internalId: bigint) {
  return await tracer.asyncSpan('load-approval-verdict-confession', async span => {
    span.setAttribute('confession.internal.id', internalId.toString());

    const lockedConfession = aliasedTable(confession, 'confession');
    const requestedTitle = aliasedTable(pendingChannelThreadTitle, 'requested_title');
    const approvedTitle = aliasedTable(pendingChannelThreadTitle, 'approved_title');
    const approvedThreadForPending = tx
      .select({
        approvedPendingChannelThreadId: approvedTitle.pendingChannelThreadId,
        approvedThreadTitle: approvedTitle.title,
        approvedThreadId: approvedChannelThread.threadId,
      })
      .from(approvedChannelThread)
      .innerJoin(
        approvedTitle,
        eq(approvedChannelThread.confessionInternalId, approvedTitle.confessionInternalId),
      )
      .as('approved_thread_for_pending');

    const row = await tx
      .select({
        disabledAt: channel.disabledAt,
        label: channel.label,
        guildId: channel.guildId,
        channelId: lockedConfession.channelId,
        authorId: lockedConfession.authorId,
        approvedAt: lockedConfession.approvedAt,
        content: lockedConfession.content,
        confessionId: lockedConfession.confessionId,
        parentMessageId: lockedConfession.parentMessageId,
        ephemeralAttachmentId: ephemeralAttachment.id,
        durableAttachmentId: durableAttachment.id,
        attachmentFilename: durableAttachment.filename,
        attachmentContentType: durableAttachment.contentType,
        attachmentUrl: durableAttachment.url,
        attachmentHeight: durableAttachment.height,
        attachmentWidth: durableAttachment.width,
        pendingChannelThreadId: requestedTitle.pendingChannelThreadId,
        requestedThreadTitle: requestedTitle.title,
        threadPendingChannelThreadId: pendingChannelThread.id,
        threadParentMessageId: pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: approvedThreadForPending.approvedPendingChannelThreadId,
        approvedThreadTitle: approvedThreadForPending.approvedThreadTitle,
        approvedThreadId: approvedThreadForPending.approvedThreadId,
      })
      .from(lockedConfession)
      .innerJoin(channel, eq(lockedConfession.channelId, channel.id))
      .leftJoin(
        requestedTitle,
        eq(lockedConfession.internalId, requestedTitle.confessionInternalId),
      )
      .leftJoin(
        pendingChannelThread,
        eq(requestedTitle.pendingChannelThreadId, pendingChannelThread.id),
      )
      .leftJoin(
        approvedThreadForPending,
        eq(
          requestedTitle.pendingChannelThreadId,
          approvedThreadForPending.approvedPendingChannelThreadId,
        ),
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
      'confession.id': row.confessionId.toString(),
      label: row.label,
    });

    return createApprovalVerdictConfession(row);
  });
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
        const result = await loadApprovalVerdictConfession(tx, internalId);
        const { approvedAt, disabledAt, authorId, confessionId, label, content } = result;

        let embedAttachment: ApprovalVerdictAttachment | null = null;
        if (result.attachment !== null)
          if (result.attachment.durable === null) {
            if (isApproved) MissingDurableAttachmentApprovalError.throwNew();
            else
              logger.warn('durable attachment missing for rejected confession', {
                'attachment.id': result.attachment.ephemeralId.toString(),
              });
          } else {
            logger.debug('attachment fetched', {
              'attachment.filename': result.attachment.durable.filename,
            });

            embedAttachment = result.attachment.durable;
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

        if (result.thread !== null) {
          fields.push({ name: 'Parent Channel', value: `<#${result.channelId}>`, inline: true });
          if (result.thread.threadId !== null)
            fields.push({
              name: 'Thread Channel',
              value: `<#${result.thread.threadId}>`,
              inline: true,
            });
        }

        if (result.parentMessageId !== null)
          fields.push({
            name: 'Reply To',
            value: `https://discord.com/channels/${result.guildId}/${result.channelId}/${result.parentMessageId}`,
            inline: true,
          });

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

          if (result.thread !== null)
            fields.push({ name: 'Thread Title', value: result.thread.title, inline: true });

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

          if (result.thread !== null)
            fields.push({ name: 'Thread Title', value: result.thread.title, inline: true });

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
  if (typeof key === 'undefined') MalformedCustomIdFormat.throwNew(customId);
  if (typeof id === 'undefined') MalformedCustomIdFormat.throwNew(customId);
  const internalId = BigInt(id);

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
