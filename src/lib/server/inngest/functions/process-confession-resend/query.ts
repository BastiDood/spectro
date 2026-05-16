import { and, eq } from 'drizzle-orm';

import * as schema from '$lib/server/database/models';
import { AssertionError, assertOptional } from '$lib/assert';
import type { Interface } from '$lib/server/database';
import { Tracer } from '$lib/server/telemetry/tracer';

import type { ResendConfessionState } from './state';

const SERVICE_NAME = 'inngest.process-confession-resend.query';
const tracer = Tracer.byName(SERVICE_NAME);

interface FlatResendConfessionRow {
  confessionId: bigint;
  channelId: bigint;
  pendingChannelThreadId: bigint | null;
  authorId: bigint;
  content: string;
  createdAt: Date;
  approvedAt: Date | null;
  parentMessageId: bigint | null;
  guildId: bigint;
  label: string;
  color: string | null;
  logChannelId: bigint | null;
  threadPendingChannelThreadId: bigint | null;
  threadTitle: string | null;
  threadParentMessageId: bigint | null;
  approvedPendingChannelThreadId: bigint | null;
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

type DurableAttachmentRow = Pick<
  FlatResendConfessionRow,
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
  FlatResendConfessionRow,
  | 'approvedPendingChannelThreadId'
  | 'approvedThreadId'
  | 'pendingChannelThreadId'
  | 'threadParentMessageId'
  | 'threadPendingChannelThreadId'
  | 'threadTitle'
>;

function createDurableAttachment(row: DurableAttachmentRow) {
  if (row.durableAttachmentId === null) return null;

  if (row.attachmentId === null)
    AssertionError.throwNew(
      'invalid resend confession row: durable attachment missing ephemeral owner',
    );
  if (row.durableAttachmentEphemeralId === null)
    AssertionError.throwNew(
      'invalid resend confession row: durable attachment missing ephemeral id',
    );
  if (row.durableAttachmentEphemeralId !== row.attachmentId)
    AssertionError.throwNew('invalid resend confession row: durable attachment owner mismatch');
  if (row.durableAttachmentFilename === null)
    AssertionError.throwNew('invalid resend confession row: durable attachment missing filename');
  if (row.durableAttachmentUrl === null)
    AssertionError.throwNew('invalid resend confession row: durable attachment missing url');
  if (row.durableAttachmentProxyUrl === null)
    AssertionError.throwNew('invalid resend confession row: durable attachment missing proxy url');

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

  return {
    id: row.attachmentId,
    durable: createDurableAttachment(row),
  };
}

function createPendingThread(row: PendingThreadRow) {
  if (row.pendingChannelThreadId === null) {
    if (row.threadPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid resend confession row: orphan pending thread row');
    if (row.threadTitle !== null)
      AssertionError.throwNew('invalid resend confession row: orphan pending thread title');
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew('invalid resend confession row: orphan approved thread owner');
    if (row.approvedThreadId !== null)
      AssertionError.throwNew('invalid resend confession row: orphan approved thread row');
    return null;
  }

  if (row.threadPendingChannelThreadId === null)
    AssertionError.throwNew('invalid resend confession row: pending thread row missing');
  if (row.threadPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid resend confession row: pending thread id mismatch');
  if (row.threadTitle === null)
    AssertionError.throwNew('invalid resend confession row: pending thread title missing');

  if (row.approvedThreadId === null) {
    if (row.approvedPendingChannelThreadId !== null)
      AssertionError.throwNew(
        'invalid resend confession row: approved thread owner without thread id',
      );
    return {
      id: row.pendingChannelThreadId,
      title: row.threadTitle,
      parentMessageId: row.threadParentMessageId,
      approved: null,
    };
  }

  if (row.approvedPendingChannelThreadId === null)
    AssertionError.throwNew('invalid resend confession row: approved thread owner missing');
  if (row.approvedPendingChannelThreadId !== row.pendingChannelThreadId)
    AssertionError.throwNew('invalid resend confession row: approved thread owner mismatch');
  return {
    id: row.pendingChannelThreadId,
    title: row.threadTitle,
    parentMessageId: row.threadParentMessageId,
    approved: {
      threadId: row.approvedThreadId,
    },
  };
}

function createResendConfession(row: FlatResendConfessionRow): ResendConfessionState {
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
      logChannelId: row.logChannelId,
    },
    pendingThread: createPendingThread(row),
    attachment: createAttachment(row),
  };
}

export async function loadResendConfession(db: Interface, channelId: bigint, confessionId: bigint) {
  return await tracer.asyncSpan('load-resend-confession', async span => {
    span.setAttributes({
      'channel.id': channelId.toString(),
      'confession.id': confessionId.toString(),
    });

    const row = await db
      .select({
        confessionId: schema.confession.confessionId,
        channelId: schema.confession.channelId,
        pendingChannelThreadId: schema.confession.pendingChannelThreadId,
        authorId: schema.confession.authorId,
        content: schema.confession.content,
        createdAt: schema.confession.createdAt,
        approvedAt: schema.confession.approvedAt,
        parentMessageId: schema.confession.parentMessageId,
        guildId: schema.channel.guildId,
        label: schema.channel.label,
        color: schema.channel.color,
        logChannelId: schema.channel.logChannelId,
        threadPendingChannelThreadId: schema.pendingChannelThread.id,
        threadTitle: schema.pendingChannelThread.title,
        threadParentMessageId: schema.pendingChannelThread.parentMessageId,
        approvedPendingChannelThreadId: schema.approvedChannelThread.pendingChannelThreadId,
        approvedThreadId: schema.approvedChannelThread.threadId,
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
        schema.pendingChannelThread,
        eq(schema.confession.pendingChannelThreadId, schema.pendingChannelThread.id),
      )
      .leftJoin(
        schema.approvedChannelThread,
        eq(schema.pendingChannelThread.id, schema.approvedChannelThread.pendingChannelThreadId),
      )
      .leftJoin(
        schema.ephemeralAttachment,
        eq(schema.confession.internalId, schema.ephemeralAttachment.confessionInternalId),
      )
      .leftJoin(
        schema.durableAttachment,
        eq(schema.ephemeralAttachment.id, schema.durableAttachment.ephemeralAttachmentId),
      )
      .where(
        and(
          eq(schema.confession.channelId, channelId),
          eq(schema.confession.confessionId, confessionId),
        ),
      )
      .limit(1)
      .then(assertOptional);
    if (typeof row === 'undefined') return;

    return createResendConfession(row);
  });
}
