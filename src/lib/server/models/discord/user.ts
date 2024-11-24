import { type InferOutput, object, optional, string } from 'valibot';
import { Snowflake } from './snowflake';

export const User = object({
    id: Snowflake,
    username: string(),
    discriminator: string(),
    global_name: optional(string()),
    avatar: optional(string()),
});

export type User = InferOutput<typeof User>;
