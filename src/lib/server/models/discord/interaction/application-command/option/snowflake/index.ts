import { type InferOutput, literal, object, union } from 'valibot';

import {
    InteractionApplicationCommandDataOptionBase,
    InteractionApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction/application-command/option/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const InteractionApplicationCommandDataOptionSnowflake = object({
    type: union([
        literal(InteractionApplicationCommandDataOptionType.User),
        literal(InteractionApplicationCommandDataOptionType.Channel),
        literal(InteractionApplicationCommandDataOptionType.Role),
        literal(InteractionApplicationCommandDataOptionType.Mentionable),
    ]),
    value: Snowflake,
    ...InteractionApplicationCommandDataOptionBase.entries,
});

export type InteractionApplicationCommandDataOptionSnowflake = InferOutput<
    typeof InteractionApplicationCommandDataOptionSnowflake
>;
