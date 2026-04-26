import { eventType } from 'inngest';
import { nullable, object, string } from 'valibot';

const RequestedAttachmentData = object({
  id: string(),
  filename: string(),
  contentType: nullable(string()),
  url: string(),
  proxyUrl: string(),
});

const ConfessionSubmitEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  channelId: string(),
  authorId: string(),
  content: string(),
  parentMessageId: nullable(string()),
  attachment: nullable(RequestedAttachmentData),
});

export const ConfessionSubmitEvent = eventType('discord/confession.submit', {
  version: '2.0.0',
  schema: ConfessionSubmitEventData,
});
