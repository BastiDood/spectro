import { type InferOutput, literal, number, object } from 'valibot';

import {
    InteractionApplicationCommandChatInputOptionBase,
    InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

export const InteractionApplicationCommandChatInputOptionNumber = object({
    ...InteractionApplicationCommandChatInputOptionBase.entries,
    type: literal(InteractionApplicationCommandChatInputOptionType.Number),
    value: number(),
});

export type InteractionApplicationCommandChatInputOptionNumber = InferOutput<
    typeof InteractionApplicationCommandChatInputOptionNumber
>;
