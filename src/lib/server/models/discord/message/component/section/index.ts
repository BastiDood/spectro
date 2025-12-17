import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponentButton } from '$lib/server/models/discord/message/component/button';
import type { MessageComponentTextDisplay } from '$lib/server/models/discord/message/component/text-display';
import type { MessageComponentThumbnail } from '$lib/server/models/discord/message/component/thumbnail';

/**
 * Outbound type for section accessory.
 * Can be either a Thumbnail or a Button.
 */
export type SectionAccessory = MessageComponentThumbnail | MessageComponentButton;

/**
 * Outbound interface for a section component.
 * A layout component that associates text content with an accessory component.
 * Contains 1-3 TextDisplay components and one accessory (Thumbnail or Button).
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export interface MessageComponentSection {
  /** Component type identifier. */
  type: MessageComponentType.Section;
  /** The text content components (1-3 TextDisplay components). */
  components: MessageComponentTextDisplay[];
  /** The accessory component (Thumbnail or Button). */
  accessory: SectionAccessory;
}
