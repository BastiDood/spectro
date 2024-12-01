import { type InferOutput, literal, object, variant } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';

import { InteractionDataMessageComponentButton } from './button';
import { InteractionDataMessageComponentSnowflakeSelect } from './snowflake-select';
import { InteractionDataMessageComponentStringSelect } from './string-select';

export const InteractionMessageComponent = object({
    ...InteractionBase.entries,
    type: literal(InteractionType.MessageComponent),
    data: variant('type', [
        InteractionDataMessageComponentButton,
        InteractionDataMessageComponentStringSelect,
        InteractionDataMessageComponentSnowflakeSelect,
    ]),
});

export type InteractionMessageComponent = InferOutput<typeof InteractionMessageComponent>;
