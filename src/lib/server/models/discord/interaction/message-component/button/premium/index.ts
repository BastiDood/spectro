import { type InferOutput, object } from 'valibot';

import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';
import { MessageComponentButtonPremium } from '$lib/server/models/discord/message/component/button/premium';

export const InteractionDataMessageComponentButtonPremium = object({
    ...InteractionDataMessageComponentBase.entries,
    ...MessageComponentButtonPremium.entries,
});

export type InteractionDataMessageComponentButtonLink = InferOutput<
    typeof InteractionDataMessageComponentButtonPremium
>;
