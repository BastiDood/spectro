import { type InferOutput, variant } from 'valibot';

import { InteractionApplicationCommandChatInputOptionAttachment } from './attachment/index.ts';
import { InteractionApplicationCommandChatInputOptionBoolean } from './boolean/index.ts';
import { InteractionApplicationCommandChatInputOptionInteger } from './integer/index.ts';
import { InteractionApplicationCommandChatInputOptionNumber } from './number/index.ts';
import { InteractionApplicationCommandChatInputOptionSnowflake } from './snowflake/index.ts';
import { InteractionApplicationCommandChatInputOptionString } from './string/index.ts';
import { InteractionApplicationCommandChatInputOptionSubCommand } from './subcommand/index.ts';

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
