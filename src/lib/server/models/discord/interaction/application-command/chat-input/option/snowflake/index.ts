import { type InferOutput, literal, object, union } from 'valibot';

import {
    InteractionApplicationCommandChatInputOptionBase,
    InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const InteractionApplicationCommandChatInputOptionSnowflake = object({
    type: union([
        literal(InteractionApplicationCommandChatInputOptionType.User),
        literal(InteractionApplicationCommandChatInputOptionType.Channel),
        literal(InteractionApplicationCommandChatInputOptionType.Role),
        literal(InteractionApplicationCommandChatInputOptionType.Mentionable),
    ]),
    value: Snowflake,
    ...InteractionApplicationCommandChatInputOptionBase.entries,
});

export type InteractionApplicationCommandChatInputOptionSnowflake = InferOutput<
    typeof InteractionApplicationCommandChatInputOptionSnowflake
>;
