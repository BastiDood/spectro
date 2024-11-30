import { type InferOutput, boolean, literal, object } from 'valibot';

import {
    InteractionApplicationCommandChatInputOptionBase,
    InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

export const InteractionApplicationCommandChatInputOptionBoolean = object({
    ...InteractionApplicationCommandChatInputOptionBase.entries,
    type: literal(InteractionApplicationCommandChatInputOptionType.Boolean),
    value: boolean(),
});

export type InteractionApplicationCommandChatInputOptionBoolean = InferOutput<
    typeof InteractionApplicationCommandChatInputOptionBoolean
>;
