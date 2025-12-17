import { type InferOutput, object, picklist } from 'valibot';

import {
  InteractionApplicationCommandChatInputOptionBase,
  InteractionApplicationCommandChatInputOptionType,
} from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const InteractionApplicationCommandChatInputOptionSnowflake = object({
  type: picklist([
    InteractionApplicationCommandChatInputOptionType.User,
    InteractionApplicationCommandChatInputOptionType.Channel,
    InteractionApplicationCommandChatInputOptionType.Role,
    InteractionApplicationCommandChatInputOptionType.Mentionable,
  ]),
  value: Snowflake,
  ...InteractionApplicationCommandChatInputOptionBase.entries,
});

export type InteractionApplicationCommandChatInputOptionSnowflake = InferOutput<
  typeof InteractionApplicationCommandChatInputOptionSnowflake
>;
