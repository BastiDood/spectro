import { type InferOutput, object, string } from 'valibot';

/** For new confession submissions (triggers post-confession + log-confession fan-out) */
export const ConfessionSubmitEventData = object({
  interactionToken: string(),
  internalId: string(),
});
export type ConfessionSubmitEventData = InferOutput<typeof ConfessionSubmitEventData>;

/** For approved confessions via publish button */
export const ApprovalEventData = object({
  interactionToken: string(),
  internalId: string(),
});
export type ApprovalEventData = InferOutput<typeof ApprovalEventData>;

/** For resending previously approved confessions */
export const ResendConfessionEventData = object({
  interactionToken: string(),
  internalId: string(),
  moderatorId: string(),
});
export type ResendConfessionEventData = InferOutput<typeof ResendConfessionEventData>;
