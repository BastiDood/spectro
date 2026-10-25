import { type InferOutput, literal, object } from 'valibot';

import {
  InteractionApplicationCommandChatInputOptionBase,
  InteractionApplicationCommandChatInputOptionType,
} from '#lib/server/models/discord/interaction/application-command/chat-input/option/base.ts';
import { Snowflake } from '#lib/server/models/discord/snowflake.ts';

export const InteractionApplicationCommandChatInputOptionAttachment = object({
  ...InteractionApplicationCommandChatInputOptionBase.entries,
  type: literal(InteractionApplicationCommandChatInputOptionType.Attachment),
  value: Snowflake,
});

export type InteractionApplicationCommandChatInputOptionAttachment = InferOutput<
  typeof InteractionApplicationCommandChatInputOptionAttachment
>;
