import { type InferOutput, array, literal, object, optional } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentSelectBase } from '$lib/server/models/discord/message/component/select/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * Default value for a role select menu.
 */
export const RoleSelectDefaultValue = object({
  /** The ID of the role. */
  id: Snowflake,
  /** The type of default value. */
  type: literal('role'),
});

export type RoleSelectDefaultValue = InferOutput<typeof RoleSelectDefaultValue>;

/**
 * A select menu for selecting roles.
 * Available in messages and modals.
 */
export const MessageComponentRoleSelect = object({
  ...MessageComponentSelectBase.entries,
  /** Component type identifier. */
  type: literal(MessageComponentType.RoleSelect),
  /** Default selected roles. */
  default_values: optional(array(RoleSelectDefaultValue)),
});

export type MessageComponentRoleSelect = InferOutput<typeof MessageComponentRoleSelect>;
