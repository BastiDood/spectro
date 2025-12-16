import { type InferOutput, literal, number, object, optional, string, variant } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentTextInput } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentFileUpload } from '$lib/server/models/discord/message/component/file-upload';
import {
  MessageComponentStringSelect,
  MessageComponentUserSelect,
  MessageComponentRoleSelect,
  MessageComponentMentionableSelect,
  MessageComponentChannelSelect,
} from '$lib/server/models/discord/message/component/select';

/**
 * Child components that can be wrapped by a Label.
 * Includes: TextInput, FileUpload, and various Select menus.
 */
export const LabelChildComponent = variant('type', [
  MessageComponentTextInput,
  MessageComponentStringSelect,
  MessageComponentUserSelect,
  MessageComponentRoleSelect,
  MessageComponentMentionableSelect,
  MessageComponentChannelSelect,
  MessageComponentFileUpload,
]);

export type LabelChildComponent = InferOutput<typeof LabelChildComponent>;

/**
 * A layout component that associates a label and description with another component.
 * Only available in modals. This is the inbound schema for receiving modal submits.
 * Discord strips the label field when returning modal submit data.
 */
export const MessageComponentLabel = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.Label),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** The label text displayed above the component. Optional when receiving. */
  label: optional(string()),
  /** Optional description text displayed below the label. */
  description: optional(string()),
  /** The wrapped component. */
  component: LabelChildComponent,
});

export type MessageComponentLabel = InferOutput<typeof MessageComponentLabel>;

/**
 * Outbound interface for creating a Label component in a modal.
 * The label field is required when sending modals.
 */
export interface CreateMessageComponentLabel {
  /** Component type identifier. */
  type: MessageComponentType.Label;
  /** Optional identifier for the component. */
  id?: number;
  /** The label text displayed above the component. Required when sending. */
  label: string;
  /** Optional description text displayed below the label. */
  description?: string;
  /** The wrapped component. */
  component: LabelChildComponent;
}
