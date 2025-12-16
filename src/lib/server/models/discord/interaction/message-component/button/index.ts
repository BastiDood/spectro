import { type InferOutput, literal, object, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

/**
 * Inbound schema for button interaction data.
 * All button interactions have the same structure: just component_type and custom_id.
 * Note: Link buttons don't trigger interactions (they open URLs directly).
 */
export const InteractionDataButton = object({
  component_type: literal(MessageComponentType.Button),
  custom_id: string(),
});

export type InteractionDataButton = InferOutput<typeof InteractionDataButton>;
