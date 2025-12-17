import { type InferOutput, variant } from 'valibot';

import { InteractionApplicationCommand } from './application-command';
import { InteractionMessageComponent } from './message-component';
import { InteractionModalSubmit } from './modal-submit';
import { InteractionPing } from './ping';

/**
 * Inbound schema for all Discord interactions.
 */
export const Interaction = variant('type', [
  InteractionPing,
  InteractionApplicationCommand,
  InteractionMessageComponent,
  InteractionModalSubmit,
]);

export type Interaction = InferOutput<typeof Interaction>;
