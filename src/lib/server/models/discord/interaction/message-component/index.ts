import { type InferOutput, literal, object, variant } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';

import { DeserializedInteractionDataMessageComponentButton, InteractionDataMessageComponentButton } from './button';
import {
    DeserializedInteractionDataMessageComponentSnowflakeSelect,
    InteractionDataMessageComponentSnowflakeSelect,
} from './snowflake-select';
import {
    DeserializedInteractionDataMessageComponentStringSelect,
    InteractionDataMessageComponentStringSelect,
} from './string-select';

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

export const DeserializedInteractionMessageComponent = object({
    ...InteractionBase.entries,
    type: literal(InteractionType.MessageComponent),
    data: variant('component_type', [
        DeserializedInteractionDataMessageComponentButton,
        DeserializedInteractionDataMessageComponentStringSelect,
        DeserializedInteractionDataMessageComponentSnowflakeSelect,
    ]),
});

export type DeserializedInteractionMessageComponent = InferOutput<typeof DeserializedInteractionMessageComponent>;
