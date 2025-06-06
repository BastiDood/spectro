import { type InferOutput, variant } from 'valibot';

import { InteractionApplicationCommandChatInputOptionAttachment } from './attachment';
import { InteractionApplicationCommandChatInputOptionBoolean } from './boolean';
import { InteractionApplicationCommandChatInputOptionInteger } from './integer';
import { InteractionApplicationCommandChatInputOptionNumber } from './number';
import { InteractionApplicationCommandChatInputOptionSnowflake } from './snowflake';
import { InteractionApplicationCommandChatInputOptionString } from './string';
import { InteractionApplicationCommandChatInputOptionSubCommand } from './subcommand';

export const InteractionApplicationCommandChatInputOption = variant('type', [
  InteractionApplicationCommandChatInputOptionSubCommand,
  InteractionApplicationCommandChatInputOptionString,
  InteractionApplicationCommandChatInputOptionInteger,
  InteractionApplicationCommandChatInputOptionBoolean,
  InteractionApplicationCommandChatInputOptionSnowflake,
  InteractionApplicationCommandChatInputOptionNumber,
  InteractionApplicationCommandChatInputOptionAttachment,
]);

export type InteractionApplicationCommandChatInputOption = InferOutput<
  typeof InteractionApplicationCommandChatInputOption
>;
