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
  tuple,
  variant,
} from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentButton } from '$lib/server/models/discord/message/component/button';
import { MessageComponentSelect } from '$lib/server/models/discord/message/component/select';

/**
 * Action Row containing 1-5 buttons.
 * Used in messages with interactive button components.
 */
export const MessageComponentActionRowButtons = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.ActionRow),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** 1-5 button components. */
  components: pipe(array(MessageComponentButton), minLength(1), maxLength(5)),
});

export type MessageComponentActionRowButtons = InferOutput<typeof MessageComponentActionRowButtons>;

/**
 * Action Row containing exactly 1 select menu.
 * Used in messages with select menu components.
 */
export const MessageComponentActionRowSelect = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.ActionRow),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** Exactly 1 select menu component. */
  components: tuple([MessageComponentSelect]),
});

export type MessageComponentActionRowSelect = InferOutput<typeof MessageComponentActionRowSelect>;

/**
 * Variant of all valid Action Row configurations for messages.
 * - Buttons: 1-5 buttons
 * - Select: exactly 1 select menu
 *
 * Note: For modals, use the Label component instead of ActionRow.
 */
export const MessageComponentActionRow = variant('type', [
  MessageComponentActionRowButtons,
  MessageComponentActionRowSelect,
]);

export type MessageComponentActionRow = InferOutput<typeof MessageComponentActionRow>;
