import { type InferOutput, array, maxLength, pipe, variant } from 'valibot';

import {
  type CreateMessageComponentLabel,
  MessageComponentLabel,
} from '$lib/server/models/discord/message/component/label';
import {
  type CreateMessageComponentTextDisplay,
  MessageComponentTextDisplay,
} from '$lib/server/models/discord/message/component/text-display';

/**
 * Top-level modal component (inbound).
 * Modals support Label (for inputs) and TextDisplay (for text).
 * Discriminated by `type` field.
 */
export const ModalComponent = variant('type', [MessageComponentLabel, MessageComponentTextDisplay]);

export type ModalComponent = InferOutput<typeof ModalComponent>;

/**
 * Array of top-level modal components (inbound).
 * Maximum 5 components per modal.
 */
export const ModalComponents = pipe(array(ModalComponent), maxLength(5));

export type ModalComponents = InferOutput<typeof ModalComponents>;

/**
 * Top-level modal component for creating modals (outbound).
 * Label requires the label field, TextDisplay requires content.
 */
export type CreateModalComponent = CreateMessageComponentLabel | CreateMessageComponentTextDisplay;

/**
 * Array of top-level modal components for creating modals (outbound).
 */
export type CreateModalComponents = CreateModalComponent[];
