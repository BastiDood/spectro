import { type InferOutput, literal, object, variant } from 'valibot';

import { InteractionBase, InteractionType } from '#lib/server/models/discord/interaction/base.ts';

import { InteractionDataButton } from './button/index.ts';
import { InteractionDataSnowflakeSelect } from './snowflake-select/index.ts';
import { InteractionDataStringSelect } from './string-select/index.ts';

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
