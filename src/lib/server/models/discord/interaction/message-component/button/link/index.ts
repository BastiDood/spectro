import { type InferOutput, object } from 'valibot';

import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';
import { MessageComponentButtonLink } from '$lib/server/models/discord/message/component/button/link';

export const InteractionDataMessageComponentButtonLink = object({
    ...InteractionDataMessageComponentBase.entries,
    ...MessageComponentButtonLink.entries,
});

export type InteractionDataMessageComponentButtonLink = InferOutput<typeof InteractionDataMessageComponentButtonLink>;
