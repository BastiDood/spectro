import type { CreateButtonLink, MessageComponentButtonLink } from './link';
import type { CreateButtonNormal, MessageComponentButtonNormal } from './normal';
import type { CreateButtonPremium, MessageComponentButtonPremium } from './premium';

/** Outbound type for any button variant. */
export type MessageComponentButton =
  | MessageComponentButtonNormal
  | MessageComponentButtonLink
  | MessageComponentButtonPremium;

/** Alias type for creating any button type (outbound). */
export type CreateButton = CreateButtonNormal | CreateButtonLink | CreateButtonPremium;
