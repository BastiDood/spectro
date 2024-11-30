import { type InferOutput, pipe, string, transform } from 'valibot';

export const RawSnowflake = string();

export type RawSnowflake = InferOutput<typeof RawSnowflake>;

export const Snowflake = pipe(
    RawSnowflake,
    transform(id => BigInt(id)),
);

export type Snowflake = InferOutput<typeof Snowflake>;
