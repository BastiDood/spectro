import { type InferOutput, string } from 'valibot';

export const Timestamp = string();
export type Timestamp = InferOutput<typeof Timestamp>;
