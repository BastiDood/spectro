import { eventType } from 'inngest';
import { type InferOutput, object, optional, string } from 'valibot';

/** For confession submissions and resends (triggers process-confession) */
export const ConfessionProcessEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  internalId: string(),
  /** Present for resend, absent for fresh submit */
  moderatorId: optional(string()),
});
export type ConfessionProcessEventData = InferOutput<typeof ConfessionProcessEventData>;

/** For approved confessions via publish button */
export const ApprovalEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  internalId: string(),
});
export type ApprovalEventData = InferOutput<typeof ApprovalEventData>;

export const ConfessionProcessEvent = eventType('discord/confession.process', {
  schema: ConfessionProcessEventData,
});

export const ConfessionApprovalEvent = eventType('discord/confession.approve', {
  schema: ApprovalEventData,
});
