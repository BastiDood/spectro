import { type InferOutput, array, literal, object, optional } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentSelectBase } from '$lib/server/models/discord/message/component/select/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * Default value for a user select menu.
 */
export const UserSelectDefaultValue = object({
  /** The ID of the user. */
  id: Snowflake,
  /** The type of default value. */
  type: literal('user'),
});

export type UserSelectDefaultValue = InferOutput<typeof UserSelectDefaultValue>;

/**
 * A select menu for selecting users.
 * Available in messages and modals.
 */
export const MessageComponentUserSelect = object({
  ...MessageComponentSelectBase.entries,
  /** Component type identifier. */
  type: literal(MessageComponentType.UserSelect),
  /** Default selected users. */
  default_values: optional(array(UserSelectDefaultValue)),
});

export type MessageComponentUserSelect = InferOutput<typeof MessageComponentUserSelect>;
