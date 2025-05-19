import { type InferOutput, object, optional, string } from 'valibot';

import { Resolved } from '$lib/server/models/discord/resolved';

export const enum InteractionApplicationCommandType {
  ChatInput = 1,
  User = 2,
  Message = 3,
  PrimaryEntryPoint = 4,
}

export const InteractionApplicationCommandBase = object({
  name: string(),
  resolved: optional(Resolved),
});

export type InteractionApplicationCommandBase = InferOutput<
  typeof InteractionApplicationCommandBase
>;
