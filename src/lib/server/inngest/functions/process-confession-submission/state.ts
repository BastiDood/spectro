import type { AnyValueMap } from '@opentelemetry/api-logs';
import { NonRetriableError } from 'inngest';

import type { InsertableAttachment, PersistableDurableAttachment } from '$lib/server/database';
import { Logger } from '$lib/server/telemetry/logger';
import type { SerializedAttachment } from '$lib/server/confession';

import type { loadConfessionSubmissionChannel } from './query';

const SERVICE_NAME = 'inngest.process-confession-submission.state';
const logger = Logger.byName(SERVICE_NAME);

export class FatalConfessionSubmissionStateError extends NonRetriableError {
  static throwNew(message: string, attributes?: AnyValueMap): never {
    const error = new FatalConfessionSubmissionStateError(message);
    logger.fatal(message, error, attributes);
    throw error;
  }
}

export interface LoadedConfessionSubmissionChannel {
  guildId: bigint;
  logChannelId: bigint;
  disabledAt: Date | null;
  isApprovalRequired: boolean;
  label: string;
  color: string | null;
}

export interface SerializedConfessionForProcess {
  internalId: string;
  confessionId: string;
  channelId: string;
  pendingChannelThreadId: string | null;
  publishChannelId: string;
  authorId: string;
  content: string;
  createdAt: string;
  approvedAt: string | null;
  parentMessageId: string | null;
  pendingThreadTitle: string | null;
  channel: {
    guildId: string;
    label: string;
    color: string | null;
    logChannelId: string;
    isApprovalRequired: boolean;
  };
  thread: {
    id: string;
    title: string;
  } | null;
  attachment: SerializedAttachment | null;
}

export interface SerializedConfessionForDispatch {
  confessionId: string;
  channelId: string;
  pendingChannelThreadId: string | null;
  publishChannelId: string;
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

export interface FailedLogConfessionResult {
  logged: false;
  content: string;
  resetLogChannelId: string | null;
}

export interface LoggedConfessionWithoutAttachmentResult {
  logged: true;
  attachmentId: null;
  durableAttachment: null;
}

export interface LoggedConfessionWithAttachmentResult {
  logged: true;
  attachmentId: string;
  durableAttachment: PersistableDurableAttachment;
}

export type LoggedConfessionResult =
  LoggedConfessionWithAttachmentResult | LoggedConfessionWithoutAttachmentResult;

export type LogConfessionResult = FailedLogConfessionResult | LoggedConfessionResult;

type ConfessionSubmissionChannelRow = Awaited<ReturnType<typeof loadConfessionSubmissionChannel>>;
type RequestedAttachment = Pick<
  SerializedAttachment,
  'contentType' | 'filename' | 'id' | 'proxyUrl' | 'url'
>;

export function mapConfessionSubmissionChannel(
  row: ConfessionSubmissionChannelRow | undefined,
  submittedAt: Date,
): LoadedConfessionSubmissionChannel | string {
  if (typeof row === 'undefined') return 'This channel has not been set up for confessions yet.';

  if (row.disabledAt !== null && row.disabledAt <= submittedAt) {
    const timestamp = Math.floor(row.disabledAt.valueOf() / 1000);
    return `This channel has temporarily disabled confessions since <t:${timestamp}:R>.`;
  }

  if (row.logChannelId === null)
    return 'Spectro cannot submit confessions until the moderators have configured a confession log.';

  return { ...row, logChannelId: row.logChannelId };
}

export function assertConfessionSubmissionChannel(
  row: ConfessionSubmissionChannelRow | undefined,
  submittedAt: Date,
  channelId: string,
) {
  const channel = mapConfessionSubmissionChannel(row, submittedAt);
  if (typeof channel === 'string')
    return FatalConfessionSubmissionStateError.throwNew('confession channel invalid for create', {
      'channel.id': channelId,
    });
  return channel;
}

export function serializeDurableAttachment(
  durableAttachment: PersistableDurableAttachment,
): SerializedAttachment {
  return {
    id: durableAttachment.id,
    filename: durableAttachment.filename,
    contentType: durableAttachment.contentType,
    url: durableAttachment.url,
    proxyUrl: durableAttachment.proxyUrl,
    height: durableAttachment.height,
    width: durableAttachment.width,
  };
}

export function serializeRequestedAttachment(
  attachment: RequestedAttachment | null,
): InsertableAttachment | null {
  return attachment === null
    ? null
    : {
        id: attachment.id,
        filename: attachment.filename,
        content_type: attachment.contentType ?? void 0,
        url: attachment.url,
        proxy_url: attachment.proxyUrl,
      };
}

export function createPublicConfession(
  confession: Pick<
    SerializedConfessionForProcess,
    | 'channel'
    | 'channelId'
    | 'confessionId'
    | 'content'
    | 'createdAt'
    | 'parentMessageId'
    | 'pendingChannelThreadId'
    | 'pendingThreadTitle'
    | 'publishChannelId'
    | 'thread'
  >,
  attachment: SerializedAttachment | null,
): SerializedConfessionForDispatch {
  return {
    confessionId: confession.confessionId,
    channelId: confession.channelId,
    pendingChannelThreadId: confession.pendingChannelThreadId,
    publishChannelId: confession.publishChannelId,
    content: confession.content,
    createdAt: confession.createdAt,
    parentMessageId: confession.parentMessageId,
    pendingThreadTitle: confession.pendingThreadTitle,
    channel: {
      guildId: confession.channel.guildId,
      label: confession.channel.label,
      color: confession.channel.color,
    },
    thread: confession.thread,
    attachment,
  };
}
