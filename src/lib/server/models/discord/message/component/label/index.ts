import { type InferOutput, literal, object, variant } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import {
  type CreateMessageComponentFileUpload,
  MessageComponentFileUpload,
} from '$lib/server/models/discord/message/component/file-upload';
import {
  MessageComponentStringSelect,
  MessageComponentUserSelect,
  MessageComponentRoleSelect,
  MessageComponentMentionableSelect,
  MessageComponentChannelSelect,
} from '$lib/server/models/discord/message/component/select';
import {
  type CreateMessageComponentTextInput,
  MessageComponentTextInput,
} from '$lib/server/models/discord/message/component/text-input';

/**
 * Inbound Valibot variant for child components that can be wrapped by a Label.
 * Used for parsing modal submission responses.
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
 * Outbound type for child components that can be wrapped by a Label.
 * Used for creating modal components.
 */
export type CreateLabelChildComponent =
  | CreateMessageComponentTextInput
  | CreateMessageComponentFileUpload;

/**
 * Inbound schema for Label component from modal submissions.
 * Only includes fields actually accessed. Discord strips: label, description.
 * We also omit id (never accessed).
 */
export const MessageComponentLabel = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.Label),
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
  component: CreateLabelChildComponent;
}
