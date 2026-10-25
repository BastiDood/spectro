// Re-export all component types
export { MessageComponentType } from './base.ts';
export type {
  MessageComponentActionRow,
  MessageComponentActionRowButtons,
} from './action-row/index.ts';
export type { MessageComponentButton, CreateButton } from './button/index.ts';
export { MessageComponentButtonStyle } from './button/base.ts';
export type {
  MessageComponentTextInput,
  CreateMessageComponentTextInput,
} from './text-input/index.ts';
export { MessageComponentTextInputStyle } from './text-input/index.ts';
export type {
  MessageComponentTextDisplay,
  CreateMessageComponentTextDisplay,
} from './text-display/index.ts';
export type { MessageComponentThumbnail } from './thumbnail/index.ts';
export type { MessageComponentMediaGallery, MediaGalleryItem } from './media-gallery/index.ts';
export type { MessageComponentFile } from './file/index.ts';
export type { MessageComponentSeparator } from './separator/index.ts';
export { SeparatorSpacing } from './separator/index.ts';
export type { MessageComponentSection, SectionAccessory } from './section/index.ts';
export type { MessageComponentContainer, ContainerChildComponent } from './container/index.ts';
export type {
  MessageComponentLabel,
  LabelChildComponent,
  CreateMessageComponentLabel,
  CreateLabelChildComponent,
} from './label/index.ts';
export type {
  MessageComponentFileUpload,
  CreateMessageComponentFileUpload,
} from './file-upload/index.ts';
export type { UnfurledMediaItem } from './unfurled-media/index.ts';
export {
  MessageComponentSelect,
  MessageComponentSelectBase,
  MessageComponentStringSelect,
  MessageComponentUserSelect,
  MessageComponentRoleSelect,
  MessageComponentMentionableSelect,
  MessageComponentChannelSelect,
  StringSelectOption,
} from './select/index.ts';

// Import types for aggregate type definition
import type { MessageComponentActionRowButtons } from './action-row/index.ts';
import type { MessageComponentContainer } from './container/index.ts';
import type { MessageComponentFile } from './file/index.ts';
import type { MessageComponentMediaGallery } from './media-gallery/index.ts';
import type { MessageComponentSection } from './section/index.ts';
import type { MessageComponentSeparator } from './separator/index.ts';
import type { MessageComponentTextDisplay } from './text-display/index.ts';

/**
 * Outbound type for top-level message components in Components V2.
 *
 * Note: For modals, use the Label component instead of ActionRow with TextInput.
 */
export type MessageComponent =
  | MessageComponentActionRowButtons
  | MessageComponentTextDisplay
  | MessageComponentMediaGallery
  | MessageComponentFile
  | MessageComponentSeparator
  | MessageComponentSection
  | MessageComponentContainer;
