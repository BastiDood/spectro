import { type InferOutput, literal, object, string } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';
import { MessageComponents } from '$lib/server/models/discord/message/component';

export const InteractionModalSubmit = object({
    ...InteractionBase.entries,
    type: literal(InteractionType.ModalSubmit),
    data: object({
        custom_id: string(),
        components: MessageComponents,
    }),
});

export type InteractionModalSubmit = InferOutput<typeof InteractionModalSubmit>;
