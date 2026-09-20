import {
  array,
  type InferOutput,
  nullish,
  object,
  optional,
  pipe,
  string,
  transform,
} from 'valibot';

import { Snowflake } from '$lib/server/models/discord/snowflake';
import { User } from '$lib/server/models/discord/user';

export const GuildMember = object({
  user: optional(User),
  nick: nullish(string()),
  avatar: nullish(string()),
  roles: array(Snowflake),
  permissions: optional(
    pipe(
      string(),
      transform(perms => BigInt(perms)),
    ),
  ),
});

export type GuildMember = InferOutput<typeof GuildMember>;
