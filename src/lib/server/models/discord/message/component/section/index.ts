import {
  type InferOutput,
  array,
  literal,
  maxLength,
  minLength,
  number,
  object,
  optional,
  pipe,
  variant,
} from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentTextDisplay } from '$lib/server/models/discord/message/component/text-display';
import { MessageComponentThumbnail } from '$lib/server/models/discord/message/component/thumbnail';
import { MessageComponentButton } from '$lib/server/models/discord/message/component/button';

/**
 * The accessory for a Section component.
 * Can be either a Thumbnail or a Button.
 */
export const SectionAccessory = variant('type', [
  MessageComponentThumbnail,
  MessageComponentButton,
]);

export type SectionAccessory = InferOutput<typeof SectionAccessory>;

/**
 * A layout component that associates text content with an accessory component.
 * Contains 1-3 TextDisplay components and one accessory (Thumbnail or Button).
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export const MessageComponentSection = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.Section),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** The text content components (1-3 TextDisplay components). */
  components: pipe(array(MessageComponentTextDisplay), minLength(1), maxLength(3)),
  /** The accessory component (Thumbnail or Button). */
  accessory: SectionAccessory,
});

export type MessageComponentSection = InferOutput<typeof MessageComponentSection>;
