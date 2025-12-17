import {
  type InferOutput,
  boolean,
  maxValue,
  minValue,
  number,
  object,
  optional,
  pipe,
  safeInteger,
  string,
} from 'valibot';

/**
 * Base properties shared by all select menu components.
 */
export const MessageComponentSelectBase = object({
  /** A developer-defined identifier for the select menu. */
  custom_id: string(),
  /** Placeholder text shown when nothing is selected. */
  placeholder: optional(string()),
  /** Minimum number of items that must be chosen. Defaults to 1. */
  min_values: optional(pipe(number(), safeInteger(), minValue(0), maxValue(25))),
  /** Maximum number of items that can be chosen. Defaults to 1. */
  max_values: optional(pipe(number(), safeInteger(), minValue(1), maxValue(25))),
  /** Whether the select menu is disabled. */
  disabled: optional(boolean()),
});

export type MessageComponentSelectBase = InferOutput<typeof MessageComponentSelectBase>;
