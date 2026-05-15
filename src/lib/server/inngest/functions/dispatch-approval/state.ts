import type { AnyValueMap } from '@opentelemetry/api-logs';
import { NonRetriableError } from 'inngest';

import { Logger } from '$lib/server/telemetry/logger';
import type { SerializedAttachment } from '$lib/server/confession';

import type { ApprovalDispatchConfessionState } from './query';

const SERVICE_NAME = 'inngest.dispatch-approval.state';
const logger = Logger.byName(SERVICE_NAME);

export class FatalApprovalDispatchStateError extends NonRetriableError {
  static throwNew(message: string, attributes?: AnyValueMap): never {
    const error = new FatalApprovalDispatchStateError(message);
    logger.fatal(message, error, attributes);
    throw error;
  }
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

type ResolvedApprovalConfessionSource = Pick<
  ApprovalDispatchConfessionState,
  | 'attachment'
  | 'channel'
  | 'channelId'
  | 'confessionId'
  | 'content'
  | 'createdAt'
  | 'parentMessageId'
  | 'pendingThread'
>;

function serializeAttachment(
  confession: Pick<ApprovalDispatchConfessionState, 'attachment'>,
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

export function serializeResolvedApprovalConfession(
  confession: ResolvedApprovalConfessionSource,
): ApprovalDispatchConfession {
  const { pendingThread } = confession;
  const approvedThread = pendingThread?.approved ?? null;
  if (pendingThread !== null && approvedThread === null)
    return FatalApprovalDispatchStateError.throwNew(
      'approved confession thread destination unresolved',
      { 'pending.channel.thread.id': pendingThread.id.toString() },
    );

  const pendingChannelThreadId = pendingThread?.id.toString() ?? null;
  const publishChannelId = approvedThread?.threadId.toString() ?? confession.channelId.toString();

  return {
    confessionId: confession.confessionId.toString(),
    channelId: confession.channelId.toString(),
    pendingChannelThreadId,
    publishChannelId,
    content: confession.content,
    createdAt: confession.createdAt.toISOString(),
    parentMessageId: confession.parentMessageId?.toString() ?? null,
    channel: {
      guildId: confession.channel.guildId.toString(),
      label: confession.channel.label,
      color: confession.channel.color,
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
