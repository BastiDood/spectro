import { type InferOutput, object, nullable, string } from 'valibot';
import { Snowflake } from './snowflake';

export const User = object({
    id: Snowflake,
    username: string(),
    discriminator: string(),
    global_name: nullable(string()),
    avatar: nullable(string()),
});

export type User = InferOutput<typeof User>;
