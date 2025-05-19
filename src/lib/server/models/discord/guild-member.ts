import { type InferOutput, array, nullish, object, optional, pipe, string, transform } from 'valibot';
import { Snowflake } from './snowflake';
import { User } from './user';

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
