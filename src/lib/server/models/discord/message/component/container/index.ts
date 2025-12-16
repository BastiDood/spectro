import {
  type InferOutput,
  array,
  boolean,
  literal,
  nullable,
  number,
  object,
  optional,
  pipe,
  safeInteger,
  variant,
} from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentTextDisplay } from '$lib/server/models/discord/message/component/text-display';
import { MessageComponentMediaGallery } from '$lib/server/models/discord/message/component/media-gallery';
import { MessageComponentFile } from '$lib/server/models/discord/message/component/file';
import { MessageComponentSeparator } from '$lib/server/models/discord/message/component/separator';
import { MessageComponentSection } from '$lib/server/models/discord/message/component/section';
import { MessageComponentActionRowButtons } from '$lib/server/models/discord/message/component/action-row';

/**
 * Child components that can be placed inside a Container.
 * Includes: ActionRow (buttons only), TextDisplay, Section, MediaGallery, File, Separator
 *
 * Note: Only ActionRowButtons is allowed in containers (not select menus or text inputs).
 */
export const ContainerChildComponent = variant('type', [
  MessageComponentActionRowButtons,
  MessageComponentTextDisplay,
  MessageComponentSection,
  MessageComponentMediaGallery,
  MessageComponentSeparator,
  MessageComponentFile,
]);

export type ContainerChildComponent = InferOutput<typeof ContainerChildComponent>;

/**
 * A layout component that visually groups a set of components.
 * Displays a border similar to an embed with an optional accent color.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export const MessageComponentContainer = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.Container),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** The child components inside the container. */
  components: array(ContainerChildComponent),
  /** The accent color as RGB integer (0x000000 to 0xFFFFFF). */
  accent_color: optional(nullable(pipe(number(), safeInteger()))),
  /** Whether the container should be blurred out as a spoiler. */
  spoiler: optional(boolean()),
});

export type MessageComponentContainer = InferOutput<typeof MessageComponentContainer>;
