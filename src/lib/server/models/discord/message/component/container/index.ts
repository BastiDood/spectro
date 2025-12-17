import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponentActionRowButtons } from '$lib/server/models/discord/message/component/action-row';
import type { MessageComponentFile } from '$lib/server/models/discord/message/component/file';
import type { MessageComponentMediaGallery } from '$lib/server/models/discord/message/component/media-gallery';
import type { MessageComponentSection } from '$lib/server/models/discord/message/component/section';
import type { MessageComponentSeparator } from '$lib/server/models/discord/message/component/separator';
import type { MessageComponentTextDisplay } from '$lib/server/models/discord/message/component/text-display';

/**
 * Outbound type for child components that can be placed inside a Container.
 * Includes: ActionRow (buttons only), TextDisplay, Section, MediaGallery, File, Separator
 *
 * Note: Only ActionRowButtons is allowed in containers (not select menus or text inputs).
 */
export type ContainerChildComponent =
  | MessageComponentActionRowButtons
  | MessageComponentTextDisplay
  | MessageComponentSection
  | MessageComponentMediaGallery
  | MessageComponentSeparator
  | MessageComponentFile;

/**
 * Outbound interface for a container component.
 * A layout component that visually groups a set of components.
 * Displays a border similar to an embed with an optional accent color.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export interface MessageComponentContainer {
  /** Component type identifier. */
  type: MessageComponentType.Container;
  /** The child components inside the container. */
  components: ContainerChildComponent[];
  /** The accent color as RGB integer (0x000000 to 0xFFFFFF). */
  accent_color?: number | null;
  /** Whether the container should be blurred out as a spoiler. */
  spoiler?: boolean;
}
