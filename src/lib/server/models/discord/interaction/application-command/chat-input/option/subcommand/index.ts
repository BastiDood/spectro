import { type InferOutput, array, literal, object, union, variant } from 'valibot';

import {
    InteractionApplicationCommandChatInputOptionBase,
    InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

import { InteractionApplicationCommandChatInputOptionBoolean } from '$lib/server/models/discord/interaction/application-command/chat-input/option/boolean';
import { InteractionApplicationCommandChatInputOptionInteger } from '$lib/server/models/discord/interaction/application-command/chat-input/option/integer';
import { InteractionApplicationCommandChatInputOptionNumber } from '$lib/server/models/discord/interaction/application-command/chat-input/option/number';
import { InteractionApplicationCommandChatInputOptionSnowflake } from '$lib/server/models/discord/interaction/application-command/chat-input/option/snowflake';
import { InteractionApplicationCommandChatInputOptionString } from '$lib/server/models/discord/interaction/application-command/chat-input/option/string';

export const InteractionApplicationCommandChatInputOptionSubCommand = object({
    ...InteractionApplicationCommandChatInputOptionBase.entries,
    type: union([
        literal(InteractionApplicationCommandChatInputOptionType.SubCommand),
        literal(InteractionApplicationCommandChatInputOptionType.SubCommandGroup),
    ]),
    options: array(
        variant('type', [
            InteractionApplicationCommandChatInputOptionString,
            InteractionApplicationCommandChatInputOptionInteger,
            InteractionApplicationCommandChatInputOptionBoolean,
            InteractionApplicationCommandChatInputOptionSnowflake,
            InteractionApplicationCommandChatInputOptionNumber,
            // TODO: InteractionApplicationCommandDataOptionAttachment
        ]),
    ),
});

export type InteractionApplicationCommandChatInputOptionSubCommand = InferOutput<
    typeof InteractionApplicationCommandChatInputOptionSubCommand
>;
