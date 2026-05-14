import { eventType } from 'inngest';
import { literal, nullable, object, string, variant } from 'valibot';

const RequestedAttachmentData = object({
  id: string(),
  filename: string(),
  contentType: nullable(string()),
  url: string(),
  proxyUrl: string(),
});

export const enum ConfessionSubmitMode {
  Message = 'message',
  NewThread = 'new-thread',
}

const ConfessionSubmitEventBaseData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  channelId: string(),
  authorId: string(),
  content: string(),
  attachment: nullable(RequestedAttachmentData),
});

const ConfessionMessageSubmitEventData = object({
  ...ConfessionSubmitEventBaseData.entries,
  mode: literal(ConfessionSubmitMode.Message),
  threadId: nullable(string()),
  threadTitle: nullable(string()),
  parentMessageId: nullable(string()),
});

const ConfessionNewThreadSubmitEventData = object({
  ...ConfessionSubmitEventBaseData.entries,
  mode: literal(ConfessionSubmitMode.NewThread),
  threadTitle: string(),
});

const ConfessionSubmitEventData = variant('mode', [
  ConfessionMessageSubmitEventData,
  ConfessionNewThreadSubmitEventData,
]);

export const ConfessionSubmitEvent = eventType('discord/confession.submit', {
  version: '3.0.0',
  schema: ConfessionSubmitEventData,
});
