import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const enum SeparatorSpacing {
  Small = 1,
  Large = 2,
}

/**
 * Outbound interface for a separator component.
 * A layout component that adds vertical padding between other components.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export interface MessageComponentSeparator {
  /** Component type identifier. */
  type: MessageComponentType.Separator;
  /** Whether to display a visual divider line. Defaults to true. */
  divider?: boolean;
  /** The size of the separator padding. Defaults to Small. */
  spacing?: SeparatorSpacing;
}
