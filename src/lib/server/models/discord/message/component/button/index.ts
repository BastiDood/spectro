import { type InferOutput, variant } from 'valibot';

import { MessageComponentButtonLink } from './link';
import { MessageComponentButtonNormal } from './normal';
import { MessageComponentButtonPremium } from './premium';

export const MessageComponentButton = variant('style', [
    MessageComponentButtonNormal,
    MessageComponentButtonLink,
    MessageComponentButtonPremium,
]);

export type MessageComponentButton = InferOutput<typeof MessageComponentButton>;
