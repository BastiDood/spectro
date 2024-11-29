import { type InferOutput, literal, number, object } from 'valibot';

import {
    InteractionApplicationCommandDataOptionBase,
    InteractionApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction/application-command/option/base';

export const InteractionApplicationCommandDataOptionNumber = object({
    ...InteractionApplicationCommandDataOptionBase.entries,
    type: literal(InteractionApplicationCommandDataOptionType.Number),
    value: number(),
});

export type InteractionApplicationCommandDataOptionNumber = InferOutput<
    typeof InteractionApplicationCommandDataOptionNumber
>;
