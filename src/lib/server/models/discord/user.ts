import { type InferOutput, object, optional, pipe, string, transform } from 'valibot';
import { Snowflake } from './snowflake';

export const User = object({
    id: Snowflake,
    username: string(),
    discriminator: string(),
    global_name: optional(string()),
    avatar: optional(string()),
    communication_disabled_until: optional(
        pipe(
            string(),
            transform(date => new Date(date)),
        ),
    ),
});

export type User = InferOutput<typeof User>;
