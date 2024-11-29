import { type InferOutput, boolean, literal, object } from 'valibot';

import {
    InteractionApplicationCommandDataOptionBase,
    InteractionApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction/application-command/option/base';

export const InteractionApplicationCommandDataOptionBoolean = object({
    ...InteractionApplicationCommandDataOptionBase.entries,
    type: literal(InteractionApplicationCommandDataOptionType.Boolean),
    value: boolean(),
});

export type InteractionApplicationCommandDataOptionBoolean = InferOutput<
    typeof InteractionApplicationCommandDataOptionBoolean
>;
