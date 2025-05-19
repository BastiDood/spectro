import { type InferOutput, literal, object } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';

export const InteractionPing = object({
  ...InteractionBase.entries,
  type: literal(InteractionType.Ping),
});

export type InteractionPing = InferOutput<typeof InteractionPing>;
