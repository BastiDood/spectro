import { type InferOutput, object, optional, string } from 'valibot';
import { Snowflake } from './snowflake';

export const Guild = object({
    id: Snowflake,
    name: string(),
    owner_id: Snowflake,
    icon: optional(string()),
    banner: optional(string()),
});

export type Guild = InferOutput<typeof Guild>;
