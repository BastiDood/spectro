import { type InferOutput, variant } from 'valibot';

import { InteractionApplicationCommandDataOptionBoolean } from './boolean';
import { InteractionApplicationCommandDataOptionInteger } from './integer';
import { InteractionApplicationCommandDataOptionNumber } from './number';
import { InteractionApplicationCommandDataOptionSnowflake } from './snowflake';
import { InteractionApplicationCommandDataOptionString } from './string';
import { InteractionApplicationCommandDataOptionSubCommand } from './subcommand';

export const InteractionApplicationCommandDataOption = variant('type', [
    InteractionApplicationCommandDataOptionSubCommand,
    InteractionApplicationCommandDataOptionString,
    InteractionApplicationCommandDataOptionInteger,
    InteractionApplicationCommandDataOptionBoolean,
    InteractionApplicationCommandDataOptionSnowflake,
    InteractionApplicationCommandDataOptionNumber,
    // TODO: InteractionApplicationCommandDataOptionAttachment
]);

export type InteractionApplicationCommandDataOption = InferOutput<typeof InteractionApplicationCommandDataOption>;
