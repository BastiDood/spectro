import { type InferOutput, literal, object, variant } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';

import { InteractionDataButton } from './button';
import { InteractionDataSnowflakeSelect } from './snowflake-select';
import { InteractionDataStringSelect } from './string-select';

/**
 * Inbound schema for message component interactions.
 * Uses variant for data because snowflake selects share component_type values in a variant.
 */
export const InteractionMessageComponent = object({
  ...InteractionBase.entries,
  type: literal(InteractionType.MessageComponent),
  data: variant('component_type', [
    InteractionDataButton,
    InteractionDataStringSelect,
    InteractionDataSnowflakeSelect,
  ]),
});

export type InteractionMessageComponent = InferOutput<typeof InteractionMessageComponent>;
