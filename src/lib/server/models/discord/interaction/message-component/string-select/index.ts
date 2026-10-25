import { array, type InferOutput, literal, object, string } from 'valibot';

import { MessageComponentType } from '#lib/server/models/discord/message/component/base.ts';

/**
 * Inbound schema for string select interaction data.
 */
export const InteractionDataStringSelect = object({
  component_type: literal(MessageComponentType.StringSelect),
  custom_id: string(),
  values: array(string()),
});

export type InteractionDataStringSelect = InferOutput<typeof InteractionDataStringSelect>;
