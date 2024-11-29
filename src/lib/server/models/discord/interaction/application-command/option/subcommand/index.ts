import { type InferOutput, array, literal, object, union, variant } from 'valibot';

import {
    InteractionApplicationCommandDataOptionBase,
    InteractionApplicationCommandDataOptionType,
} from '$lib/server/models/discord/interaction/application-command/option/base';

import { InteractionApplicationCommandDataOptionBoolean } from '$lib/server/models/discord/interaction/application-command/option/boolean';
import { InteractionApplicationCommandDataOptionInteger } from '$lib/server/models/discord/interaction/application-command/option/integer';
import { InteractionApplicationCommandDataOptionNumber } from '$lib/server/models/discord/interaction/application-command/option/number';
import { InteractionApplicationCommandDataOptionSnowflake } from '$lib/server/models/discord/interaction/application-command/option/snowflake';
import { InteractionApplicationCommandDataOptionString } from '$lib/server/models/discord/interaction/application-command/option/string';

export const InteractionApplicationCommandDataOptionSubCommand = object({
    ...InteractionApplicationCommandDataOptionBase.entries,
    type: union([
        literal(InteractionApplicationCommandDataOptionType.SubCommand),
        literal(InteractionApplicationCommandDataOptionType.SubCommandGroup),
    ]),
    options: array(
        variant('type', [
            InteractionApplicationCommandDataOptionString,
            InteractionApplicationCommandDataOptionInteger,
            InteractionApplicationCommandDataOptionBoolean,
            InteractionApplicationCommandDataOptionSnowflake,
            InteractionApplicationCommandDataOptionNumber,
            // TODO: InteractionApplicationCommandDataOptionAttachment
        ]),
    ),
});

export type InteractionApplicationCommandDataOptionSubCommand = InferOutput<
    typeof InteractionApplicationCommandDataOptionSubCommand
>;
