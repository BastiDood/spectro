import { type InferOutput, object, string } from 'valibot';

export const enum InteractionApplicationCommandChatInputOptionType {
  SubCommand = 1,
  SubCommandGroup = 2,
  String = 3,
  Integer = 4,
  Boolean = 5,
  User = 6,
  Channel = 7,
  Role = 8,
  Mentionable = 9,
  Number = 10,
  Attachment = 11,
}

export const InteractionApplicationCommandChatInputOptionBase = object({ name: string() });

export type InteractionApplicationCommandChatInputOptionBase = InferOutput<
  typeof InteractionApplicationCommandChatInputOptionBase
>;
