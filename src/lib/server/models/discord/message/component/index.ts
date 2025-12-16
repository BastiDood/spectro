import { type InferOutput, array, maxLength, pipe, variant } from 'valibot';

import { MessageComponentActionRowButtons, MessageComponentActionRowSelect } from './action-row';
import { MessageComponentTextDisplay } from './text-display';
import { MessageComponentMediaGallery } from './media-gallery';
import { MessageComponentFile } from './file';
import { MessageComponentSeparator } from './separator';
import { MessageComponentSection } from './section';
import { MessageComponentContainer } from './container';

// Re-export all component types
export { MessageComponentType } from './base';
export {
  MessageComponentActionRow,
  MessageComponentActionRowButtons,
  MessageComponentActionRowSelect,
} from './action-row';
export { MessageComponentButton } from './button';
export { MessageComponentButtonStyle } from './button/base';
export { MessageComponentTextInput, MessageComponentTextInputStyle } from './text-input';
export { MessageComponentTextDisplay } from './text-display';
export { MessageComponentThumbnail } from './thumbnail';
export { MessageComponentMediaGallery, MediaGalleryItem } from './media-gallery';
export { MessageComponentFile } from './file';
export { MessageComponentSeparator, SeparatorSpacing } from './separator';
export { MessageComponentSection, SectionAccessory } from './section';
export { MessageComponentContainer, ContainerChildComponent } from './container';
export { MessageComponentLabel, LabelChildComponent } from './label';
export { MessageComponentFileUpload } from './file-upload';
export { UnfurledMediaItem } from './unfurled-media';
export {
  MessageComponentSelect,
  MessageComponentSelectBase,
  MessageComponentStringSelect,
  MessageComponentUserSelect,
  MessageComponentRoleSelect,
  MessageComponentMentionableSelect,
  MessageComponentChannelSelect,
  StringSelectOption,
} from './select';

/**
 * Non-ActionRow top-level components for Components V2.
 * Discriminated by `type` field.
 */
const MessageComponentNonActionRow = variant('type', [
  MessageComponentTextDisplay,
  MessageComponentMediaGallery,
  MessageComponentFile,
  MessageComponentSeparator,
  MessageComponentSection,
  MessageComponentContainer,
]);

/**
 * Top-level message component for Components V2.
 * ActionRow has multiple valid sub-types (buttons, select) with the same type value,
 * so we use variant to combine all possibilities.
 *
 * Note: For modals, use the Label component instead of ActionRow with TextInput.
 */
export const MessageComponent = variant('type', [
  MessageComponentActionRowButtons,
  MessageComponentActionRowSelect,
  MessageComponentNonActionRow,
]);

export type MessageComponent = InferOutput<typeof MessageComponent>;

/**
 * Array of top-level message components.
 * Maximum 10 components per message with IS_COMPONENTS_V2 flag.
 */
export const MessageComponents = pipe(array(MessageComponent), maxLength(10));
export type MessageComponents = InferOutput<typeof MessageComponents>;
