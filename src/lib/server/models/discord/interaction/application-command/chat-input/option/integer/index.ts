import { type InferOutput, literal, number, object, pipe, safeInteger } from 'valibot';

import {
  InteractionApplicationCommandChatInputOptionBase,
  InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

export const InteractionApplicationCommandChatInputOptionInteger = object({
  ...InteractionApplicationCommandChatInputOptionBase.entries,
  type: literal(InteractionApplicationCommandChatInputOptionType.Integer),
  value: pipe(number(), safeInteger()),
});

export type InteractionApplicationCommandChatInputOptionInteger = InferOutput<
  typeof InteractionApplicationCommandChatInputOptionInteger
>;
