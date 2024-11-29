import { type InferOutput, literal, object, string } from 'valibot';

import {
    InteractionApplicationCommandDataOptionBase,
    InteractionApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction/application-command/option/base';

export const InteractionApplicationCommandDataOptionString = object({
    ...InteractionApplicationCommandDataOptionBase.entries,
    type: literal(InteractionApplicationCommandDataOptionType.String),
    value: string(),
});

export type InteractionApplicationCommandDataOptionString = InferOutput<
    typeof InteractionApplicationCommandDataOptionString
>;
