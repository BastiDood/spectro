import { type InferOutput, object } from 'valibot';

import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';
import { MessageComponentButtonNormal } from '$lib/server/models/discord/message/component/button/normal';

export const InteractionDataMessageComponentButtonNormal = object({
    ...InteractionDataMessageComponentBase.entries,
    ...MessageComponentButtonNormal.entries,
});

export type InteractionDataMessageComponentButtonNormal = InferOutput<
    typeof InteractionDataMessageComponentButtonNormal
>;
