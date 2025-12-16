import { type InferOutput, boolean, literal, number, object, optional, picklist } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const enum SeparatorSpacing {
  Small = 1,
  Large = 2,
}

/**
 * A layout component that adds vertical padding between other components.
 * Can optionally display a visual divider line.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export const MessageComponentSeparator = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.Separator),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** Whether to display a visual divider line. Defaults to true. */
  divider: optional(boolean()),
  /** The size of the separator padding. Defaults to Small. */
  spacing: optional(picklist([SeparatorSpacing.Small, SeparatorSpacing.Large])),
});

export type MessageComponentSeparator = InferOutput<typeof MessageComponentSeparator>;
