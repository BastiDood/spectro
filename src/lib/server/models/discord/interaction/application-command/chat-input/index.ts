import { type InferOutput, array, literal, object, optional } from 'valibot';

import {
  InteractionApplicationCommandBase,
  InteractionApplicationCommandType,
} from '$lib/server/models/discord/interaction/application-command/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

import { InteractionApplicationCommandChatInputOption } from './option';

export const InteractionApplicationCommandChatInput = object({
  ...InteractionApplicationCommandBase.entries,
  type: literal(InteractionApplicationCommandType.ChatInput),
  id: Snowflake,
  guild_id: optional(Snowflake),
  options: optional(array(InteractionApplicationCommandChatInputOption)),
  // TODO: resolved
});

export type InteractionApplicationCommandChatInput = InferOutput<
  typeof InteractionApplicationCommandChatInput
>;
