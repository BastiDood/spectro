import { eventType } from 'inngest';
import { object, string } from 'valibot';

const ApprovalEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  internalId: string(),
});

export const ConfessionApprovalEvent = eventType('discord/confession.approve', {
  version: '2.0.0',
  schema: ApprovalEventData,
});
