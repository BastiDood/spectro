import { type InferOutput, literal, number, object, pipe, safeInteger } from 'valibot';

import {
    InteractionApplicationCommandDataOptionBase,
    InteractionApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction/application-command/option/base';

export const InteractionApplicationCommandDataOptionInteger = object({
    ...InteractionApplicationCommandDataOptionBase.entries,
    type: literal(InteractionApplicationCommandDataOptionType.Integer),
    value: pipe(number(), safeInteger()),
});

export type InteractionApplicationCommandDataOptionInteger = InferOutput<
    typeof InteractionApplicationCommandDataOptionInteger
>;
