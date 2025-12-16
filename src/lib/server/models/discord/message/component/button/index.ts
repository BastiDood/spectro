import { type InferOutput, variant } from 'valibot';

import { type CreateButtonLink, MessageComponentButtonLink } from './link';
import { type CreateButtonNormal, MessageComponentButtonNormal } from './normal';
import { type CreateButtonPremium, MessageComponentButtonPremium } from './premium';

export const MessageComponentButton = variant('style', [
  MessageComponentButtonNormal,
  MessageComponentButtonLink,
  MessageComponentButtonPremium,
]);

export type MessageComponentButton = InferOutput<typeof MessageComponentButton>;

/** Variant type for creating any button type (outbound). */
export type CreateButton = CreateButtonNormal | CreateButtonLink | CreateButtonPremium;
