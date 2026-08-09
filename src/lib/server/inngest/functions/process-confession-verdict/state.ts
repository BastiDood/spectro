import { NonRetriableError } from 'inngest';

import { Logger } from '$lib/server/telemetry/logger';
import type { SerializedAttachment } from '$lib/server/confession';

const SERVICE_NAME = 'inngest.process-confession-verdict.state';
const logger = Logger.byName(SERVICE_NAME);

export class MissingVerdictDispatchConfessionError extends NonRetriableError {
  constructor(public readonly internalId: string) {
    super(`Confession ${internalId} was not found for dispatch.`);
    this.name = 'MissingVerdictDispatchConfessionError';
  }

  static throwNew(internalId: string): never {
    const error = new MissingVerdictDispatchConfessionError(internalId);
    logger.error(
      error.message,
      'spectro.inngest.confession_verdict.dispatch_confession_missing',
      { 'spectro.confession.internal.id': error.internalId },
      error,
    );
    throw error;
  }
}

export class UnavailableApprovedThreadDestinationError extends NonRetriableError {
  constructor(public readonly confessionId: string) {
    super(`Approved thread destination is unavailable for confession ${confessionId}.`);
    this.name = 'UnavailableApprovedThreadDestinationError';
  }

  static throwNew(confessionId: string): never {
    const error = new UnavailableApprovedThreadDestinationError(confessionId);
    logger.error(
      error.message,
      'spectro.inngest.confession_verdict.approved_thread_destination_unavailable',
      { 'spectro.confession.id': error.confessionId },
      error,
    );
    throw error;
  }
}

export abstract class ConfessionVerdictError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ConfessionVerdictError';
  }
}

export class DisabledChannelConfessError extends ConfessionVerdictError {
  readonly disabledAt: string;

  constructor(disabledAt: Date) {
    const timestamp = Math.floor(disabledAt.valueOf() / 1000);
    super(`The confession channel has been temporarily disabled since <t:${timestamp}:R>.`);
    this.disabledAt = disabledAt.toISOString();
    this.name = 'DisabledChannelConfessError';
  }

  static throwNew(disabledAt: Date): never {
    const error = new DisabledChannelConfessError(disabledAt);
    logger.error(
      error.message,
      'spectro.inngest.confession_verdict.channel_disabled',
      {
        'spectro.channel.disabled_at': error.disabledAt,
      },
      error,
    );
    throw error;
  }
}

export class AlreadyApprovedApprovalError extends ConfessionVerdictError {
  readonly approvedAt: string;

  constructor(approvedAt: Date) {
    const timestamp = Math.floor(approvedAt.valueOf() / 1000);
    super(`This confession has already been approved since <t:${timestamp}:R>.`);
    this.approvedAt = approvedAt.toISOString();
    this.name = 'AlreadyApprovedApprovalError';
  }

  static throwNew(approvedAt: Date): never {
    const error = new AlreadyApprovedApprovalError(approvedAt);
    logger.error(
      error.message,
      'spectro.inngest.confession_verdict.already_approved',
      {
        'spectro.confession.approved_at': error.approvedAt,
      },
      error,
    );
    throw error;
  }
}

export class MissingDurableAttachmentApprovalError extends ConfessionVerdictError {
  constructor() {
    super(
      'This legacy confession includes an attachment that is no longer available in the Discord CDN, so it cannot be approved.',
    );
    this.name = 'MissingDurableAttachmentApprovalError';
  }

  static throwNew(): never {
    const error = new MissingDurableAttachmentApprovalError();
    logger.error(
      error.message,
      'spectro.inngest.confession_verdict.durable_attachment_missing',
      void 0,
      error,
    );
    throw error;
  }
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
  durable: DurableAttachmentState;
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

export interface ApprovedConfessionState {
  confessionId: bigint;
  channelId: bigint;
  authorId: bigint;
  content: string;
  createdAt: Date;
  approvedAt: Date;
  parentMessageId: bigint | null;
  channel: {
    guildId: bigint;
    label: string;
    color: string | null;
  };
  pendingThread: PendingThreadState | null;
  attachment: AttachmentState | null;
}

interface ConfessionVerdictDurableAttachmentState {
  id: bigint;
  filename: string;
  contentType: string | null;
  url: string;
  proxyUrl: string;
  height: number | null;
  width: number | null;
}

interface ConfessionVerdictThreadState {
  title: string;
  threadId: bigint | null;
}

export interface ConfessionVerdictConfessionState {
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
  thread: ConfessionVerdictThreadState | null;
  attachment: ConfessionVerdictDurableAttachmentState | null;
  missingAttachmentId: bigint | null;
}

export interface ConfessionVerdictLogConfession {
  confessionId: string;
  channelId: string;
  publishChannelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  parentMessageId: string | null;
  pendingThreadTitle: string | null;
  channel: {
    guildId: string;
    label: string;
    color: string | null;
  };
  thread: {
    id: string;
    title: string;
  } | null;
  attachment: SerializedAttachment | null;
}

interface LoadedPendingThread {
  id: string;
  title: string;
  parentMessageId: string | null;
  approvedThreadId: string | null;
}

export interface LoadedApprovedConfession {
  confessionId: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  parentMessageId: string | null;
  channel: {
    guildId: string;
    label: string;
    color: string | null;
  };
  pendingThread: LoadedPendingThread | null;
  attachment: SerializedAttachment | null;
}

export interface ApprovedConfession {
  confessionId: string;
  channelId: string;
  pendingChannelThreadId: string | null;
  publishChannelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  parentMessageId: string | null;
  pendingThreadTitle: string | null;
  channel: {
    guildId: string;
    label: string;
    color: string | null;
  };
  thread: {
    id: string;
    title: string;
  } | null;
  attachment: SerializedAttachment | null;
}

export function serializeLoadedApprovedConfession(
  loaded: ApprovedConfessionState,
): LoadedApprovedConfession {
  const { pendingThread } = loaded;

  let attachment: SerializedAttachment | null = null;
  if (loaded.attachment !== null) {
    const { durable } = loaded.attachment;
    attachment = {
      id: durable.id.toString(),
      filename: durable.filename,
      contentType: durable.contentType,
      url: durable.url,
      proxyUrl: durable.proxyUrl,
      height: durable.height,
      width: durable.width,
    };
  }

  let loadedPendingThread: LoadedPendingThread | null = null;
  if (pendingThread !== null)
    loadedPendingThread = {
      id: pendingThread.id.toString(),
      title: pendingThread.title,
      parentMessageId: pendingThread.parentMessageId?.toString() ?? null,
      approvedThreadId: pendingThread.approved?.threadId.toString() ?? null,
    };

  return {
    confessionId: loaded.confessionId.toString(),
    channelId: loaded.channelId.toString(),
    authorId: loaded.authorId.toString(),
    content: loaded.content,
    createdAt: loaded.createdAt.toISOString(),
    parentMessageId: loaded.parentMessageId?.toString() ?? null,
    channel: {
      guildId: loaded.channel.guildId.toString(),
      label: loaded.channel.label,
      color: loaded.channel.color,
    },
    pendingThread: loadedPendingThread,
    attachment,
  };
}

export function serializeDeletedLogConfession(
  confession: ConfessionVerdictConfessionState,
  createdAt: Date,
): ConfessionVerdictLogConfession {
  let publishChannelId = confession.channelId.toString();
  let pendingThreadTitle: string | null = null;
  let thread: ConfessionVerdictLogConfession['thread'] = null;
  if (confession.thread !== null) {
    pendingThreadTitle = confession.thread.title;
    const { threadId } = confession.thread;
    if (threadId !== null) {
      publishChannelId = threadId.toString();
      thread = {
        id: publishChannelId,
        title: confession.thread.title,
      };
    }
  }

  let attachment: SerializedAttachment | null = null;
  if (confession.attachment !== null)
    attachment = {
      id: confession.attachment.id.toString(),
      filename: confession.attachment.filename,
      contentType: confession.attachment.contentType,
      url: confession.attachment.url,
      proxyUrl: confession.attachment.proxyUrl,
      height: confession.attachment.height,
      width: confession.attachment.width,
    };

  return {
    confessionId: confession.confessionId.toString(),
    channelId: confession.channelId.toString(),
    publishChannelId,
    authorId: confession.authorId.toString(),
    content: confession.content,
    createdAt: createdAt.toISOString(),
    parentMessageId: confession.parentMessageId?.toString() ?? null,
    pendingThreadTitle,
    channel: {
      guildId: confession.guildId.toString(),
      label: confession.label,
      color: confession.color,
    },
    thread,
    attachment,
  };
}
