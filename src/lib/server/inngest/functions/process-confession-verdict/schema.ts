import { eventType } from 'inngest';
import { object, picklist, string } from 'valibot';

export const enum ConfessionVerdict {
  Approve = 'approve',
  Delete = 'delete',
}

const ConfessionVerdictEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  internalId: string(),
  moderatorId: string(),
  verdict: picklist([ConfessionVerdict.Approve, ConfessionVerdict.Delete]),
});

export const ConfessionVerdictEvent = eventType('discord/confession.verdict', {
  version: '1.0.0',
  schema: ConfessionVerdictEventData,
});
