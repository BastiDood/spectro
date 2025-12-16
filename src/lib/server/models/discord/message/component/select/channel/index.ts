import {
  type InferOutput,
  array,
  literal,
  number,
  object,
  optional,
  pipe,
  safeInteger,
} from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentSelectBase } from '$lib/server/models/discord/message/component/select/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * Default value for a channel select menu.
 */
export const ChannelSelectDefaultValue = object({
  /** The ID of the channel. */
  id: Snowflake,
  /** The type of default value. */
  type: literal('channel'),
});

export type ChannelSelectDefaultValue = InferOutput<typeof ChannelSelectDefaultValue>;

/**
 * A select menu for selecting channels.
 * Available in messages and modals.
 */
export const MessageComponentChannelSelect = object({
  ...MessageComponentSelectBase.entries,
  /** Component type identifier. */
  type: literal(MessageComponentType.ChannelSelect),
  /** Channel types to include in the options. */
  channel_types: optional(array(pipe(number(), safeInteger()))),
  /** Default selected channels. */
  default_values: optional(array(ChannelSelectDefaultValue)),
});

export type MessageComponentChannelSelect = InferOutput<typeof MessageComponentChannelSelect>;
