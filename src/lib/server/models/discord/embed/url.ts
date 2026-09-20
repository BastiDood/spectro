import { type InferOutput, string } from 'valibot';

export const Url = string();
export type Url = InferOutput<typeof Url>;
