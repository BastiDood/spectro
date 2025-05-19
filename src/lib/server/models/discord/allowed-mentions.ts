import { type InferOutput, array, boolean, object, picklist } from 'valibot';

import { Snowflake } from './snowflake';

export const enum AllowedMentionType {
  Roles = 'roles',
  Users = 'users',
  Everyone = 'everyone',
}

export const AllowedMentions = object({
  parse: array(
    picklist([AllowedMentionType.Roles, AllowedMentionType.Users, AllowedMentionType.Everyone]),
  ),
  roles: array(Snowflake),
  users: array(Snowflake),
  replied_user: boolean(),
});

export type AllowedMentions = InferOutput<typeof AllowedMentions>;
