import { type InferOutput, boolean, nullable, object, string } from 'valibot';
import { Snowflake } from './snowflake';

export const Guild = object({
    id: Snowflake,
    name: string(),
    owner: boolean(),
    owner_id: Snowflake,
    icon: nullable(string()),
    banner: nullable(string()),
});

export type Guild = InferOutput<typeof Guild>;
