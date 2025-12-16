import { type InferOutput, literal, object, optional, number, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

/**
 * A content component that displays markdown text.
 * Available in messages and modals.
 */
export const MessageComponentTextDisplay = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.TextDisplay),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** The markdown text content (max 4000 characters). */
  content: string(),
});

export type MessageComponentTextDisplay = InferOutput<typeof MessageComponentTextDisplay>;
