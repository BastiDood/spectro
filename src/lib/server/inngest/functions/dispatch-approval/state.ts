import type { AnyValueMap } from '@opentelemetry/api-logs';
import { NonRetriableError } from 'inngest';

import { Logger } from '$lib/server/telemetry/logger';
import type { SerializedAttachment } from '$lib/server/confession';

const SERVICE_NAME = 'inngest.dispatch-approval.state';
const logger = Logger.byName(SERVICE_NAME);

export class FatalApprovalDispatchStateError extends NonRetriableError {
  static throwNew(message: string, attributes?: AnyValueMap): never {
    const error = new FatalApprovalDispatchStateError(message);
    logger.fatal(message, error, attributes);
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

export interface ApprovalDispatchConfessionState {
  confessionId: bigint;
  channelId: bigint;
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

interface LoadedPendingThread {
  id: string;
  title: string;
  parentMessageId: string | null;
  approvedThreadId: string | null;
}

export interface LoadedApprovalConfession {
  confessionId: string;
  channelId: string;
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

export interface ApprovalDispatchConfession {
  confessionId: string;
  channelId: string;
  pendingChannelThreadId: string | null;
  publishChannelId: string;
  content: string;
  createdAt: string;
  parentMessageId: string | null;
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

export function serializeLoadedApprovalConfession(
  loaded: ApprovalDispatchConfessionState,
): LoadedApprovalConfession {
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
