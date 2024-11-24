import { type InferOutput, array, number, object, optional, pipe, safeInteger, string } from 'valibot';
import { Snowflake } from './snowflake';
import { User } from './user';

export const GuildMember = object({
    user: User,
    nick: optional(string()),
    avatar: optional(string()),
    roles: array(Snowflake),
    flags: pipe(number(), safeInteger()),
});

export type GuildMember = InferOutput<typeof GuildMember>;
