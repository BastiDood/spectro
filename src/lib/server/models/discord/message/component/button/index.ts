import type { CreateButtonLink, MessageComponentButtonLink } from './link/index.ts';
import type { CreateButtonNormal, MessageComponentButtonNormal } from './normal/index.ts';
import type { CreateButtonPremium, MessageComponentButtonPremium } from './premium/index.ts';

/** Outbound type for any button variant. */
export type MessageComponentButton =
  MessageComponentButtonNormal | MessageComponentButtonLink | MessageComponentButtonPremium;

/** Alias type for creating any button type (outbound). */
export type CreateButton = CreateButtonNormal | CreateButtonLink | CreateButtonPremium;
