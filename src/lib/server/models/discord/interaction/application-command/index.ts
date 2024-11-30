import { type InferOutput, literal, object, variant } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';

import { InteractionApplicationCommandChatInput } from './chat-input';

export const InteractionApplicationCommand = object({
    ...InteractionBase.entries,
    type: literal(InteractionType.ApplicationCommand),
    data: variant('type', [InteractionApplicationCommandChatInput]),
});

export type InteractionApplicationCommand = InferOutput<typeof InteractionApplicationCommand>;
