import { array, type InferOutput, literal, object, optional } from 'valibot';

import {
  InteractionApplicationCommandBase,
  InteractionApplicationCommandType,
} from '#lib/server/models/discord/interaction/application-command/base.ts';
import { Snowflake } from '#lib/server/models/discord/snowflake.ts';

import { InteractionApplicationCommandChatInputOption } from './option/index.ts';

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
