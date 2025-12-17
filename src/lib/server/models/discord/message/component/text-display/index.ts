import { type InferOutput, literal, object, optional, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

/**
 * Inbound schema for TextDisplay in modal submissions.
 * Only includes fields actually accessed. Discord strips content on modal submit.
 * We also omit id (never accessed).
 */
export const MessageComponentTextDisplay = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.TextDisplay),
  /** The markdown text content. Optional when receiving modal submissions (Discord strips it). */
  content: optional(string()),
});

export type MessageComponentTextDisplay = InferOutput<typeof MessageComponentTextDisplay>;

/**
 * Outbound interface for creating a TextDisplay component.
 * The content field is required when sending.
 */
export interface CreateMessageComponentTextDisplay {
  /** Component type identifier. */
  type: MessageComponentType.TextDisplay;
  /** Optional identifier for the component. */
  id?: number;
  /** The markdown text content (max 4000 characters). Required when sending. */
  content: string;
}
