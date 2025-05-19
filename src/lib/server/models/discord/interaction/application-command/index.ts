import { type InferOutput, literal, object, variant } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';

import { InteractionApplicationCommandChatInput } from './chat-input';
import { InteractionApplicationCommandMessage } from './message';
import { InteractionApplicationCommandUser } from './user';

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
