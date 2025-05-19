import { type InferOutput, pipe, string, transform } from 'valibot';

export const Url = pipe(
  string(),
  transform(url => new URL(url)),
);

export type Url = InferOutput<typeof Url>;
