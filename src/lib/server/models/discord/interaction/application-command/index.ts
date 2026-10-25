import { type InferOutput, literal, object, variant } from 'valibot';

import { InteractionBase, InteractionType } from '#lib/server/models/discord/interaction/base.ts';

import { InteractionApplicationCommandChatInput } from './chat-input/index.ts';
import { InteractionApplicationCommandMessage } from './message/index.ts';
import { InteractionApplicationCommandUser } from './user/index.ts';

export const InteractionApplicationCommand = object({
  ...InteractionBase.entries,
  type: literal(InteractionType.ApplicationCommand),
  data: variant('type', [
    InteractionApplicationCommandChatInput,
    InteractionApplicationCommandMessage,
    InteractionApplicationCommandUser,
  ]),
});

export type InteractionApplicationCommand = InferOutput<typeof InteractionApplicationCommand>;
