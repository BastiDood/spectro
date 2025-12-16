import {
  type InferOutput,
  array,
  boolean,
  literal,
  maxLength,
  minLength,
  object,
  optional,
  pipe,
  string,
} from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentSelectBase } from '$lib/server/models/discord/message/component/select/base';
import { Emoji } from '$lib/server/models/discord/emoji';

/**
 * An option in a string select menu.
 */
export const StringSelectOption = object({
  /** The user-facing label for the option (max 100 characters). */
  label: string(),
  /** The developer-defined value for the option (max 100 characters). */
  value: string(),
  /** Additional description for the option (max 100 characters). */
  description: optional(string()),
  /** Emoji to display with the option. */
  emoji: optional(Emoji),
  /** Whether this option is selected by default. */
  default: optional(boolean()),
});

export type StringSelectOption = InferOutput<typeof StringSelectOption>;

/**
 * A select menu for picking from defined text options.
 * Available in messages and modals.
 */
export const MessageComponentStringSelect = object({
  ...MessageComponentSelectBase.entries,
  /** Component type identifier. */
  type: literal(MessageComponentType.StringSelect),
  /** The options to choose from (max 25). */
  options: pipe(array(StringSelectOption), minLength(1), maxLength(25)),
});

export type MessageComponentStringSelect = InferOutput<typeof MessageComponentStringSelect>;
