import { type InferOutput, array, nullish, number, object, pipe, safeInteger, string } from 'valibot';
import { Snowflake } from './snowflake';
import { User } from './user';

export const GuildMember = object({
    user: User,
    nick: nullish(string()),
    avatar: nullish(string()),
    roles: array(Snowflake),
    flags: pipe(number(), safeInteger()),
});

export type GuildMember = InferOutput<typeof GuildMember>;
