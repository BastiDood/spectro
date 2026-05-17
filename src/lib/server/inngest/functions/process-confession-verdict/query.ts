import { aliasedTable, eq } from 'drizzle-orm';

import * as schema from '$lib/server/database/models';
import { AssertionError, assertOptional, assertSingle } from '$lib/assert';
import type { Interface, Transaction } from '$lib/server/database';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import type { ApprovedConfessionState, ConfessionVerdictConfessionState } from './state';

const SERVICE_NAME = 'inngest.process-confession-verdict.query';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

interface FlatConfessionVerdictConfessionRow {
  disabledAt: Date | null;
  label: string;
  color: string | null;
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
  attachmentProxyUrl: string | null;
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

type ConfessionVerdictAttachmentRow = Pick<
  FlatConfessionVerdictConfessionRow,
  | 'attachmentContentType'
  | 'attachmentFilename'
  | 'attachmentHeight'
  | 'attachmentProxyUrl'
  | 'attachmentUrl'
  | 'attachmentWidth'
  | 'durableAttachmentId'
  | 'ephemeralAttachmentId'
>;

type ConfessionVerdictThreadRow = Pick<
  FlatConfessionVerdictConfessionRow,
  | 'approvedPendingChannelThreadId'
  | 'approvedThreadId'
  | 'approvedThreadTitle'
  | 'pendingChannelThreadId'
  | 'requestedThreadTitle'
  | 'threadParentMessageId'
  | 'threadPendingChannelThreadId'
>;

interface FlatApprovedConfessionRow {
  confessionId: bigint;
  channelId: bigint;
  authorId: bigint;
  pendingChannelThreadId: bigint | null;
  content: string;
  createdAt: Date;
  approvedAt: Date | null;
  parentMessageId: bigint | null;
  guildId: bigint;
  label: string;
  color: string | null;
  threadPendingChannelThreadId: bigint | null;
  requestedThreadTitle: string | null;
  approvedThreadTitle: string | null;
  threadParentMessageId: bigint | null;
  approvedPendingChannelThreadId: bigint | null;
  approvedThreadTitleConfessionInternalId: bigint | null;
  approvedThreadId: bigint | null;
  attachmentId: bigint | null;
  durableAttachmentId: bigint | null;
  durableAttachmentEphemeralId: bigint | null;
  durableAttachmentFilename: string | null;
  durableAttachmentContentType: string | null;
  durableAttachmentUrl: string | null;
  durableAttachmentProxyUrl: string | null;
  durableAttachmentHeight: number | null;
  durableAttachmentWidth: number | null;
}

function createConfessionVerdictAttachment(row: ConfessionVerdictAttachmentRow) {
  if (row.ephemeralAttachmentId === null) {
    if (row.durableAttachmentId !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan durable attachment');
    if (row.attachmentFilename !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan attachment filename');
    if (row.attachmentContentType !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan attachment content type');
    if (row.attachmentUrl !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan attachment url');
    if (row.attachmentProxyUrl !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan attachment proxy url');
    if (row.attachmentHeight !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan attachment height');
    if (row.attachmentWidth !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan attachment width');
    return {
      attachment: null,
      missingAttachmentId: null,
    };
  }

  if (row.durableAttachmentId === null) {
    if (row.attachmentFilename !== null)
      AssertionError.throwNew('invalid confession verdict row: durable filename without id');
    if (row.attachmentContentType !== null)
      AssertionError.throwNew('invalid confession verdict row: durable content type without id');
    if (row.attachmentUrl !== null)
      AssertionError.throwNew('invalid confession verdict row: durable url without id');
    if (row.attachmentProxyUrl !== null)
      AssertionError.throwNew('invalid confession verdict row: durable proxy url without id');
    if (row.attachmentHeight !== null)
      AssertionError.throwNew('invalid confession verdict row: durable height without id');
    if (row.attachmentWidth !== null)
      AssertionError.throwNew('invalid confession verdict row: durable width without id');
    return {
      attachment: null,
      missingAttachmentId: row.ephemeralAttachmentId,
    };
  }

  if (row.attachmentFilename === null)
    AssertionError.throwNew('invalid confession verdict row: durable attachment missing filename');
  if (row.attachmentUrl === null)
    AssertionError.throwNew('invalid confession verdict row: durable attachment missing url');
  if (row.attachmentProxyUrl === null)
    AssertionError.throwNew('invalid confession verdict row: durable attachment missing proxy url');

  return {
    attachment: {
      id: row.durableAttachmentId,
      filename: row.attachmentFilename,
      contentType: row.attachmentContentType,
      url: row.attachmentUrl,
      proxyUrl: row.attachmentProxyUrl,
      height: row.attachmentHeight,
      width: row.attachmentWidth,
    },
    missingAttachmentId: null,
  };
}

function createConfessionVerdictThread(row: ConfessionVerdictThreadRow) {
  if (row.pendingChannelThreadId === null) {
    if (row.threadPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan pending thread row');
    if (row.threadParentMessageId !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan thread parent message');
    if (row.requestedThreadTitle !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan requested thread title');
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan approved thread owner');
    if (row.approvedThreadTitle !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan approved thread title');
    if (row.approvedThreadId !== null)
      AssertionError.throwNew('invalid confession verdict row: orphan approved thread id');
    return null;
  }

  if (row.threadPendingChannelThreadId === null)
    AssertionError.throwNew('invalid confession verdict row: pending thread row missing');
  if (row.threadPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid confession verdict row: pending thread id mismatch');
  if (row.requestedThreadTitle === null)
    AssertionError.throwNew('invalid confession verdict row: requested thread title missing');

  if (row.approvedThreadId === null) {
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid confession verdict row: approved owner without thread id');
    if (row.approvedThreadTitle !== null)
      AssertionError.throwNew('invalid confession verdict row: approved title without thread id');
    return {
      title: row.requestedThreadTitle,
      threadId: null,
    };
  }

  if (row.approvedPendingChannelThreadId === null)
    AssertionError.throwNew('invalid confession verdict row: approved thread owner missing');
  if (row.approvedPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid confession verdict row: approved thread owner mismatch');
  if (row.approvedThreadTitle === null)
    AssertionError.throwNew('invalid confession verdict row: approved thread title missing');

  return {
    title: row.requestedThreadTitle,
    threadId: row.approvedThreadId,
  };
}

function createConfessionVerdictConfession(
  row: FlatConfessionVerdictConfessionRow,
): ConfessionVerdictConfessionState {
  const { attachment, missingAttachmentId } = createConfessionVerdictAttachment(row);

  return {
    disabledAt: row.disabledAt,
    label: row.label,
    color: row.color,
    guildId: row.guildId,
    channelId: row.channelId,
    authorId: row.authorId,
    approvedAt: row.approvedAt,
    content: row.content,
    confessionId: row.confessionId,
    parentMessageId: row.parentMessageId,
    thread: createConfessionVerdictThread(row),
    attachment,
    missingAttachmentId,
  };
}

type DurableAttachmentRow = Pick<
  FlatApprovedConfessionRow,
  | 'attachmentId'
  | 'durableAttachmentContentType'
  | 'durableAttachmentEphemeralId'
  | 'durableAttachmentFilename'
  | 'durableAttachmentHeight'
  | 'durableAttachmentId'
  | 'durableAttachmentProxyUrl'
  | 'durableAttachmentUrl'
  | 'durableAttachmentWidth'
>;

type AttachmentRow = DurableAttachmentRow;

type PendingThreadRow = Pick<
  FlatApprovedConfessionRow,
  | 'approvedPendingChannelThreadId'
  | 'approvedThreadId'
  | 'approvedThreadTitle'
  | 'approvedThreadTitleConfessionInternalId'
  | 'pendingChannelThreadId'
  | 'requestedThreadTitle'
  | 'threadParentMessageId'
  | 'threadPendingChannelThreadId'
>;

function createDurableAttachment(row: DurableAttachmentRow) {
  if (row.durableAttachmentId === null) return null;

  if (row.attachmentId === null)
    AssertionError.throwNew(
      'invalid approved confession row: durable attachment missing ephemeral owner',
    );
  if (row.durableAttachmentEphemeralId === null)
    AssertionError.throwNew(
      'invalid approved confession row: durable attachment missing ephemeral id',
    );
  if (row.durableAttachmentEphemeralId !== row.attachmentId)
    AssertionError.throwNew('invalid approved confession row: durable attachment owner mismatch');
  if (row.durableAttachmentFilename === null)
    AssertionError.throwNew('invalid approved confession row: durable attachment missing filename');
  if (row.durableAttachmentUrl === null)
    AssertionError.throwNew('invalid approved confession row: durable attachment missing url');
  if (row.durableAttachmentProxyUrl === null)
    AssertionError.throwNew(
      'invalid approved confession row: durable attachment missing proxy url',
    );

  return {
    id: row.durableAttachmentId,
    filename: row.durableAttachmentFilename,
    contentType: row.durableAttachmentContentType,
    url: row.durableAttachmentUrl,
    proxyUrl: row.durableAttachmentProxyUrl,
    height: row.durableAttachmentHeight,
    width: row.durableAttachmentWidth,
  };
}

function createAttachment(row: AttachmentRow) {
  if (row.attachmentId === null) return null;

  const durable = createDurableAttachment(row);
  if (durable === null)
    AssertionError.throwNew(
      'invalid approved confession row: confession attachment missing durable copy',
    );

  return {
    id: row.attachmentId,
    durable,
  };
}

function createPendingThread(row: PendingThreadRow) {
  if (row.pendingChannelThreadId === null) {
    if (row.threadPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid approved confession row: orphan pending thread row');
    if (row.requestedThreadTitle !== null)
      AssertionError.throwNew('invalid approved confession row: orphan requested thread title');
    if (row.approvedThreadTitle !== null)
      AssertionError.throwNew('invalid approved confession row: orphan approved thread title');
    if (row.approvedThreadTitleConfessionInternalId !== null)
      AssertionError.throwNew('invalid approved confession row: orphan approved title owner');
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid approved confession row: orphan approved thread owner');
    if (row.approvedThreadId !== null)
      AssertionError.throwNew('invalid approved confession row: orphan approved thread row');
    return null;
  }

  if (row.threadPendingChannelThreadId === null)
    AssertionError.throwNew('invalid approved confession row: pending thread row missing');
  if (row.threadPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid approved confession row: pending thread id mismatch');
  if (row.requestedThreadTitle === null)
    AssertionError.throwNew('invalid approved confession row: requested thread title missing');

  if (row.approvedThreadId === null) {
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew(
        'invalid approved confession row: approved thread owner without thread id',
      );
    if (row.approvedThreadTitleConfessionInternalId !== null)
      AssertionError.throwNew('invalid approved confession row: approved title without thread id');
    if (row.approvedThreadTitle !== null)
      AssertionError.throwNew('invalid approved confession row: approved title without thread id');
    return {
      id: row.pendingChannelThreadId,
      title: row.requestedThreadTitle,
      parentMessageId: row.threadParentMessageId,
      approved: null,
    };
  }

  if (row.approvedPendingChannelThreadId === null)
    AssertionError.throwNew('invalid approved confession row: approved thread owner missing');
  if (row.approvedPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid approved confession row: approved thread owner mismatch');
  if (row.approvedThreadTitleConfessionInternalId === null)
    AssertionError.throwNew('invalid approved confession row: approved title owner missing');
  if (row.approvedThreadTitle === null)
    AssertionError.throwNew('invalid approved confession row: approved thread title missing');
  return {
    id: row.pendingChannelThreadId,
    title: row.requestedThreadTitle,
    parentMessageId: row.threadParentMessageId,
    approved: {
      threadId: row.approvedThreadId,
    },
  };
}

function createApprovedConfession(row: FlatApprovedConfessionRow): ApprovedConfessionState {
  if (row.approvedAt === null)
    AssertionError.throwNew('invalid approved confession row: confession not approved');
  return {
    confessionId: row.confessionId,
    channelId: row.channelId,
    authorId: row.authorId,
    content: row.content,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    parentMessageId: row.parentMessageId,
    channel: {
      guildId: row.guildId,
      label: row.label,
      color: row.color,
    },
    pendingThread: createPendingThread(row),
    attachment: createAttachment(row),
  };
}

export async function loadVerdictConfession(tx: Transaction, internalId: bigint) {
  return await tracer.asyncSpan('load-verdict-confession', async span => {
    span.setAttribute('confession.internal.id', internalId.toString());

    const lockedConfession = aliasedTable(schema.confession, 'confession');
    const requestedTitle = aliasedTable(schema.pendingChannelThreadTitle, 'requested_title');
    const approvedTitle = aliasedTable(schema.pendingChannelThreadTitle, 'approved_title');
    const approvedThreadForPending = tx
      .select({
        approvedPendingChannelThreadId: approvedTitle.pendingChannelThreadId,
        approvedThreadTitle: approvedTitle.title,
        approvedThreadId: schema.approvedChannelThread.threadId,
      })
      .from(schema.approvedChannelThread)
      .innerJoin(
        approvedTitle,
        eq(schema.approvedChannelThread.confessionInternalId, approvedTitle.confessionInternalId),
      )
      .as('approved_thread_for_pending');

    const row = await tx
      .select({
        disabledAt: schema.channel.disabledAt,
        label: schema.channel.label,
        color: schema.channel.color,
        guildId: schema.channel.guildId,
        channelId: lockedConfession.channelId,
        authorId: lockedConfession.authorId,
        approvedAt: lockedConfession.approvedAt,
        content: lockedConfession.content,
        confessionId: lockedConfession.confessionId,
        parentMessageId: lockedConfession.parentMessageId,
        ephemeralAttachmentId: schema.ephemeralAttachment.id,
        durableAttachmentId: schema.durableAttachment.id,
        attachmentFilename: schema.durableAttachment.filename,
        attachmentContentType: schema.durableAttachment.contentType,
        attachmentUrl: schema.durableAttachment.url,
        attachmentProxyUrl: schema.durableAttachment.proxyUrl,
        attachmentHeight: schema.durableAttachment.height,
        attachmentWidth: schema.durableAttachment.width,
        pendingChannelThreadId: requestedTitle.pendingChannelThreadId,
        requestedThreadTitle: requestedTitle.title,
        threadPendingChannelThreadId: schema.pendingChannelThread.id,
        threadParentMessageId: schema.pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: approvedThreadForPending.approvedPendingChannelThreadId,
        approvedThreadTitle: approvedThreadForPending.approvedThreadTitle,
        approvedThreadId: approvedThreadForPending.approvedThreadId,
      })
      .from(lockedConfession)
      .innerJoin(schema.channel, eq(lockedConfession.channelId, schema.channel.id))
      .leftJoin(
        requestedTitle,
        eq(lockedConfession.internalId, requestedTitle.confessionInternalId),
      )
      .leftJoin(
        schema.pendingChannelThread,
        eq(requestedTitle.pendingChannelThreadId, schema.pendingChannelThread.id),
      )
      .leftJoin(
        approvedThreadForPending,
        eq(
          requestedTitle.pendingChannelThreadId,
          approvedThreadForPending.approvedPendingChannelThreadId,
        ),
      )
      .leftJoin(
        schema.ephemeralAttachment,
        eq(lockedConfession.internalId, schema.ephemeralAttachment.confessionInternalId),
      )
      .leftJoin(
        schema.durableAttachment,
        eq(schema.ephemeralAttachment.id, schema.durableAttachment.ephemeralAttachmentId),
      )
      .where(eq(lockedConfession.internalId, internalId))
      .limit(1)
      .for('update', { of: lockedConfession })
      .then(assertSingle);

    logger.debug('confession details fetched', {
      'confession.id': row.confessionId.toString(),
      label: row.label,
    });

    return createConfessionVerdictConfession(row);
  });
}

export async function loadApprovedConfession(db: Interface, internalId: bigint) {
  return await tracer.asyncSpan('load-approved-confession', async span => {
    span.setAttribute('confession.internal.id', internalId.toString());

    const requestedTitle = aliasedTable(schema.pendingChannelThreadTitle, 'requested_title');
    const approvedTitle = aliasedTable(schema.pendingChannelThreadTitle, 'approved_title');
    const approvedThreadForPending = db
      .select({
        approvedPendingChannelThreadId: approvedTitle.pendingChannelThreadId,
        approvedThreadTitle: approvedTitle.title,
        approvedThreadTitleConfessionInternalId: schema.approvedChannelThread.confessionInternalId,
        approvedThreadId: schema.approvedChannelThread.threadId,
      })
      .from(schema.approvedChannelThread)
      .innerJoin(
        approvedTitle,
        eq(schema.approvedChannelThread.confessionInternalId, approvedTitle.confessionInternalId),
      )
      .as('approved_thread_for_pending');

    const row = await db
      .select({
        confessionId: schema.confession.confessionId,
        channelId: schema.confession.channelId,
        authorId: schema.confession.authorId,
        pendingChannelThreadId: requestedTitle.pendingChannelThreadId,
        content: schema.confession.content,
        createdAt: schema.confession.createdAt,
        approvedAt: schema.confession.approvedAt,
        parentMessageId: schema.confession.parentMessageId,
        guildId: schema.channel.guildId,
        label: schema.channel.label,
        color: schema.channel.color,
        threadPendingChannelThreadId: schema.pendingChannelThread.id,
        requestedThreadTitle: requestedTitle.title,
        threadParentMessageId: schema.pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: approvedThreadForPending.approvedPendingChannelThreadId,
        approvedThreadTitle: approvedThreadForPending.approvedThreadTitle,
        approvedThreadTitleConfessionInternalId:
          approvedThreadForPending.approvedThreadTitleConfessionInternalId,
        approvedThreadId: approvedThreadForPending.approvedThreadId,
        attachmentId: schema.ephemeralAttachment.id,
        durableAttachmentId: schema.durableAttachment.id,
        durableAttachmentEphemeralId: schema.durableAttachment.ephemeralAttachmentId,
        durableAttachmentFilename: schema.durableAttachment.filename,
        durableAttachmentContentType: schema.durableAttachment.contentType,
        durableAttachmentUrl: schema.durableAttachment.url,
        durableAttachmentProxyUrl: schema.durableAttachment.proxyUrl,
        durableAttachmentHeight: schema.durableAttachment.height,
        durableAttachmentWidth: schema.durableAttachment.width,
      })
      .from(schema.confession)
      .innerJoin(schema.channel, eq(schema.confession.channelId, schema.channel.id))
      .leftJoin(
        requestedTitle,
        eq(schema.confession.internalId, requestedTitle.confessionInternalId),
      )
      .leftJoin(
        schema.pendingChannelThread,
        eq(requestedTitle.pendingChannelThreadId, schema.pendingChannelThread.id),
      )
      .leftJoin(
        approvedThreadForPending,
        eq(
          requestedTitle.pendingChannelThreadId,
          approvedThreadForPending.approvedPendingChannelThreadId,
        ),
      )
      .leftJoin(
        schema.ephemeralAttachment,
        eq(schema.confession.internalId, schema.ephemeralAttachment.confessionInternalId),
      )
      .leftJoin(
        schema.durableAttachment,
        eq(schema.ephemeralAttachment.id, schema.durableAttachment.ephemeralAttachmentId),
      )
      .where(eq(schema.confession.internalId, internalId))
      .limit(1)
      .then(assertOptional);
    if (typeof row === 'undefined') return;

    return createApprovedConfession(row);
  });
}
