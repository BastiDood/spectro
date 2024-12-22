import { type InferOutput, literal, object } from 'valibot';

import {
    InteractionApplicationCommandChatInputOptionBase,
    InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

export const InteractionApplicationCommandChatInputOptionAttachment = object({
    ...InteractionApplicationCommandChatInputOptionBase.entries,
    type: literal(InteractionApplicationCommandChatInputOptionType.Attachment),
});

export type InteractionApplicationCommandChatInputOptionAttachment = InferOutput<
    typeof InteractionApplicationCommandChatInputOptionAttachment
>;
