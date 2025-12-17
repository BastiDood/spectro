// Re-export all component types
export { MessageComponentType } from './base';
export type { MessageComponentActionRow, MessageComponentActionRowButtons } from './action-row';
export type { MessageComponentButton, CreateButton } from './button';
export { MessageComponentButtonStyle } from './button/base';
export type { MessageComponentTextInput, CreateMessageComponentTextInput } from './text-input';
export { MessageComponentTextInputStyle } from './text-input';
export type {
  MessageComponentTextDisplay,
  CreateMessageComponentTextDisplay,
} from './text-display';
export type { MessageComponentThumbnail } from './thumbnail';
export type { MessageComponentMediaGallery, MediaGalleryItem } from './media-gallery';
export type { MessageComponentFile } from './file';
export type { MessageComponentSeparator } from './separator';
export { SeparatorSpacing } from './separator';
export type { MessageComponentSection, SectionAccessory } from './section';
export type { MessageComponentContainer, ContainerChildComponent } from './container';
export type {
  MessageComponentLabel,
  LabelChildComponent,
  CreateMessageComponentLabel,
  CreateLabelChildComponent,
} from './label';
export type { MessageComponentFileUpload, CreateMessageComponentFileUpload } from './file-upload';
export type { UnfurledMediaItem } from './unfurled-media';
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

// Import types for aggregate type definition
import type { MessageComponentActionRowButtons } from './action-row';
import type { MessageComponentTextDisplay } from './text-display';
import type { MessageComponentMediaGallery } from './media-gallery';
import type { MessageComponentFile } from './file';
import type { MessageComponentSeparator } from './separator';
import type { MessageComponentSection } from './section';
import type { MessageComponentContainer } from './container';

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
