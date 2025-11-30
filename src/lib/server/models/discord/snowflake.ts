import { type InferOutput, string } from 'valibot';

export const Snowflake = string();
export type Snowflake = InferOutput<typeof Snowflake>;
