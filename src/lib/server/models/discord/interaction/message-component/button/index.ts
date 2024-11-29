import { type InferOutput, variant } from 'valibot';

import { InteractionDataMessageComponentButtonLink } from './link';
import { InteractionDataMessageComponentButtonNormal } from './normal';
import { InteractionDataMessageComponentButtonPremium } from './premium';

export const InteractionDataMessageComponentButton = variant('style', [
    InteractionDataMessageComponentButtonLink,
    InteractionDataMessageComponentButtonNormal,
    InteractionDataMessageComponentButtonPremium,
]);

export type InteractionMessageComponentButton = InferOutput<typeof InteractionDataMessageComponentButton>;
