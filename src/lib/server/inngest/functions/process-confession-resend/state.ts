import type { SerializedAttachment } from '$lib/server/confession';

export interface SerializedConfessionForResend {
  confessionId: string;
  channelId: string;
  pendingChannelThreadId: string | null;
  publishChannelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  parentMessageId: string | null;
  channel: {
    guildId: string;
    label: string;
    color: string | null;
    logChannelId: string;
  };
  thread: {
    id: string;
    title: string;
  } | null;
  attachment: SerializedAttachment | null;
}

interface DurableAttachmentState {
  id: bigint;
  filename: string;
  contentType: string | null;
  url: string;
  proxyUrl: string;
  height: number | null;
  width: number | null;
}

interface AttachmentState {
  id: bigint;
  durable: DurableAttachmentState | null;
}

interface ApprovedThreadState {
  threadId: bigint;
}

interface PendingThreadState {
  id: bigint;
  title: string;
  parentMessageId: bigint | null;
  approved: ApprovedThreadState | null;
}

export interface ResendConfessionState {
  confessionId: bigint;
  channelId: bigint;
  authorId: bigint;
  content: string;
  createdAt: Date;
  approvedAt: Date | null;
  parentMessageId: bigint | null;
  channel: {
    guildId: bigint;
    label: string;
    color: string | null;
    logChannelId: bigint | null;
  };
  pendingThread: PendingThreadState | null;
  attachment: AttachmentState | null;
}

type ResendConfessionSource = Pick<
  ResendConfessionState,
  | 'approvedAt'
  | 'attachment'
  | 'authorId'
  | 'channel'
  | 'channelId'
  | 'confessionId'
  | 'content'
  | 'createdAt'
  | 'parentMessageId'
  | 'pendingThread'
>;

type ResolvedPendingThread = NonNullable<ResendConfessionState['pendingThread']> & {
  approved: NonNullable<NonNullable<ResendConfessionState['pendingThread']>['approved']>;
};

type DurableAttachment = NonNullable<NonNullable<ResendConfessionState['attachment']>['durable']>;

interface ValidatedResendAttachment {
  id: bigint;
  durable: DurableAttachment;
}

interface ValidatedResendConfession extends Pick<
  ResendConfessionState,
  'authorId' | 'channelId' | 'confessionId' | 'content' | 'createdAt' | 'parentMessageId'
> {
  approvedAt: Date;
  channel: Pick<ResendConfessionState['channel'], 'color' | 'guildId' | 'label'> & {
    logChannelId: bigint;
  };
  pendingThread: ResolvedPendingThread | null;
  attachment: ValidatedResendAttachment | null;
}

function serializeAttachment(
  confession: Pick<ValidatedResendConfession, 'attachment'>,
): SerializedAttachment | null {
  if (confession.attachment === null) return null;

  const { durable } = confession.attachment;
  return {
    id: durable.id.toString(),
    filename: durable.filename,
    contentType: durable.contentType,
    url: durable.url,
    proxyUrl: durable.proxyUrl,
    height: durable.height,
    width: durable.width,
  };
}

function serializeResendConfession(
  confession: Pick<
    ValidatedResendConfession,
    | 'attachment'
    | 'authorId'
    | 'channel'
    | 'channelId'
    | 'confessionId'
    | 'content'
    | 'createdAt'
    | 'parentMessageId'
    | 'pendingThread'
  >,
): SerializedConfessionForResend {
  const { pendingThread } = confession;
  const approvedThread = pendingThread?.approved ?? null;

  return {
    confessionId: confession.confessionId.toString(),
    channelId: confession.channelId.toString(),
    pendingChannelThreadId: pendingThread?.id.toString() ?? null,
    publishChannelId: approvedThread?.threadId.toString() ?? confession.channelId.toString(),
    authorId: confession.authorId.toString(),
    content: confession.content,
    createdAt: confession.createdAt.toISOString(),
    parentMessageId: confession.parentMessageId?.toString() ?? null,
    channel: {
      guildId: confession.channel.guildId.toString(),
      label: confession.channel.label,
      color: confession.channel.color,
      logChannelId: confession.channel.logChannelId.toString(),
    },
    thread:
      approvedThread === null || pendingThread === null
        ? null
        : {
            id: approvedThread.threadId.toString(),
            title: pendingThread.title,
          },
    attachment: serializeAttachment(confession),
  };
}

export function createResendConfessionState(
  confession: ResendConfessionSource | undefined,
  confessionId: bigint,
  hasAttachmentPermission: boolean,
) {
  if (typeof confession === 'undefined')
    return `Confession #${confessionId} does not exist in this channel.`;

  if (confession.approvedAt === null)
    return `Confession #${confessionId} has not yet been approved for publication in this channel.`;

  if (confession.channel.logChannelId === null)
    return 'You cannot resend confessions until a valid confession log channel has been configured.';

  let pendingThread: ResolvedPendingThread | null = null;
  if (confession.pendingThread !== null) {
    const { approved } = confession.pendingThread;
    if (approved === null)
      return `Confession #${confessionId} is associated with a pending thread destination that is not publishable yet.`;
    pendingThread = {
      ...confession.pendingThread,
      approved,
    };
  }

  let attachment: ValidatedResendAttachment | null = null;
  if (confession.attachment !== null) {
    const { durable } = confession.attachment;
    if (durable === null)
      return `Confession #${confessionId} includes a legacy attachment that is no longer available in the Discord CDN, so it cannot be resent.`;

    if (!hasAttachmentPermission)
      return 'You do not have the permission to resend confessions with attachments in this channel.';

    attachment = {
      id: confession.attachment.id,
      durable,
    };
  }

  return serializeResendConfession({
    authorId: confession.authorId,
    channelId: confession.channelId,
    confessionId: confession.confessionId,
    content: confession.content,
    createdAt: confession.createdAt,
    parentMessageId: confession.parentMessageId,
    channel: {
      ...confession.channel,
      logChannelId: confession.channel.logChannelId,
    },
    pendingThread,
    attachment,
  });
}
