import { type InferOutput, pipe, string, transform } from 'valibot';

export const Snowflake = pipe(
    string(),
    transform(id => BigInt(id)),
);

export type RawSnowflake = InferOutput<(typeof Snowflake.pipe)[0]>;
export type Snowflake = InferOutput<typeof Snowflake>;
