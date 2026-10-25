import { type InferOutput, variant } from 'valibot';

import { InteractionApplicationCommand } from './application-command/index.ts';
import { InteractionMessageComponent } from './message-component/index.ts';
import { InteractionModalSubmit } from './modal-submit/index.ts';
import { InteractionPing } from './ping/index.ts';

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
