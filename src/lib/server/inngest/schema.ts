import { type InferOutput, object, optional, string } from 'valibot';

/** For confession submissions and resends (triggers post-confession + log-confession fan-out) */
export const ConfessionSubmitEventData = object({
  interactionToken: string(),
  internalId: string(),
  /** Present for resend, absent for fresh submit */
  moderatorId: optional(string()),
});
export type ConfessionSubmitEventData = InferOutput<typeof ConfessionSubmitEventData>;

/** For approved confessions via publish button */
export const ApprovalEventData = object({
  interactionToken: string(),
  internalId: string(),
});
export type ApprovalEventData = InferOutput<typeof ApprovalEventData>;
