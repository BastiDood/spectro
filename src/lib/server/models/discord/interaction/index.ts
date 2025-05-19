import { type InferOutput, variant } from 'valibot';

import {
  DeserializedInteractionMessageComponent,
  InteractionMessageComponent,
} from './message-component';
import { InteractionApplicationCommand } from './application-command';
import { InteractionModalSubmit } from './modal-submit';
import { InteractionPing } from './ping';

export const Interaction = variant('type', [
  InteractionPing,
  InteractionApplicationCommand,
  InteractionMessageComponent,
  InteractionModalSubmit,
]);

export type Interaction = InferOutput<typeof Interaction>;

export const DeserializedInteraction = variant('type', [
  InteractionPing,
  InteractionApplicationCommand,
  DeserializedInteractionMessageComponent,
  InteractionModalSubmit,
]);

export type DeserializedInteraction = InferOutput<typeof DeserializedInteraction>;
