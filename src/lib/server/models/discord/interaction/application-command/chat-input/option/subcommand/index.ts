import { array, type InferOutput, object, picklist, variant } from 'valibot';

import {
  InteractionApplicationCommandChatInputOptionBase,
  InteractionApplicationCommandChatInputOptionType,
} from '#lib/server/models/discord/interaction/application-command/chat-input/option/base.js';
import { InteractionApplicationCommandChatInputOptionBoolean } from '#lib/server/models/discord/interaction/application-command/chat-input/option/boolean/index.js';
import { InteractionApplicationCommandChatInputOptionInteger } from '#lib/server/models/discord/interaction/application-command/chat-input/option/integer/index.js';
import { InteractionApplicationCommandChatInputOptionNumber } from '#lib/server/models/discord/interaction/application-command/chat-input/option/number/index.js';
import { InteractionApplicationCommandChatInputOptionSnowflake } from '#lib/server/models/discord/interaction/application-command/chat-input/option/snowflake/index.js';
import { InteractionApplicationCommandChatInputOptionString } from '#lib/server/models/discord/interaction/application-command/chat-input/option/string/index.js';

export const InteractionApplicationCommandChatInputOptionSubCommand = object({
  ...InteractionApplicationCommandChatInputOptionBase.entries,
  type: picklist([
    InteractionApplicationCommandChatInputOptionType.SubCommand,
    InteractionApplicationCommandChatInputOptionType.SubCommandGroup,
  ]),
  options: array(
    variant('type', [
      InteractionApplicationCommandChatInputOptionString,
      InteractionApplicationCommandChatInputOptionInteger,
      InteractionApplicationCommandChatInputOptionBoolean,
      InteractionApplicationCommandChatInputOptionSnowflake,
      InteractionApplicationCommandChatInputOptionNumber,
      // TODO: InteractionApplicationCommandDataOptionAttachment
    ]),
  ),
});

export type InteractionApplicationCommandChatInputOptionSubCommand = InferOutput<
  typeof InteractionApplicationCommandChatInputOptionSubCommand
>;
