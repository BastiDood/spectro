import { type InferOutput, literal, object, optional, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const enum MessageComponentTextInputStyle {
  Short = 1,
  Long = 2,
}

/**
 * Inbound schema for TextInput - only fields Discord returns on modal submit.
 * Discord strips: style, label, min_length, max_length, required, placeholder.
 */
export const MessageComponentTextInput = object({
  type: literal(MessageComponentType.TextInput),
  custom_id: string(),
  value: optional(string()),
});

export type MessageComponentTextInput = InferOutput<typeof MessageComponentTextInput>;

/**
 * Outbound interface for creating a TextInput in modals.
 * All configuration fields are available when sending.
 */
export interface CreateMessageComponentTextInput {
  type: MessageComponentType.TextInput;
  custom_id: string;
  style?: MessageComponentTextInputStyle;
  label?: string;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  value?: string;
  placeholder?: string;
}
