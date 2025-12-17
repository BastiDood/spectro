import { type InferOutput, array, literal, object, optional, variant } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageComponentSelectBase } from '$lib/server/models/discord/message/component/select/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * Default value for a mentionable select menu (user).
 */
export const MentionableSelectDefaultValueUser = object({
  /** The ID of the user. */
  id: Snowflake,
  /** The type of default value. */
  type: literal('user'),
});

/**
 * Default value for a mentionable select menu (role).
 */
export const MentionableSelectDefaultValueRole = object({
  /** The ID of the role. */
  id: Snowflake,
  /** The type of default value. */
  type: literal('role'),
});

export const MentionableSelectDefaultValue = variant('type', [
  MentionableSelectDefaultValueUser,
  MentionableSelectDefaultValueRole,
]);

export type MentionableSelectDefaultValue = InferOutput<typeof MentionableSelectDefaultValue>;

/**
 * A select menu for selecting users and roles.
 * Available in messages and modals.
 */
export const MessageComponentMentionableSelect = object({
  ...MessageComponentSelectBase.entries,
  /** Component type identifier. */
  type: literal(MessageComponentType.MentionableSelect),
  /** Default selected mentionables. */
  default_values: optional(array(MentionableSelectDefaultValue)),
});

export type MessageComponentMentionableSelect = InferOutput<
  typeof MessageComponentMentionableSelect
>;
