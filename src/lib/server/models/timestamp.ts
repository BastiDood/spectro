import { type InferOutput, pipe, string, transform } from 'valibot';

export const Timestamp = pipe(
  string(),
  transform(date => new Date(date)),
);

export type Timestamp = InferOutput<typeof Timestamp>;
