import { type InferOutput, literal, object, string } from 'valibot';

import {
  InteractionApplicationCommandChatInputOptionBase,
  InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

export const InteractionApplicationCommandChatInputOptionString = object({
  ...InteractionApplicationCommandChatInputOptionBase.entries,
  type: literal(InteractionApplicationCommandChatInputOptionType.String),
  value: string(),
});

export type InteractionApplicationCommandChatInputString = InferOutput<
  typeof InteractionApplicationCommandChatInputOptionString
>;
