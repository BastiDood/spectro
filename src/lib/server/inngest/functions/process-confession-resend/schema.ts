import { eventType } from 'inngest';
import { object, string } from 'valibot';

const ConfessionResendEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  channelId: string(),
  moderatorId: string(),
  memberPermissions: string(),
  confessionId: string(),
});

export const ConfessionResendEvent = eventType('discord/confession.resend', {
  version: '2.0.0',
  schema: ConfessionResendEventData,
});
