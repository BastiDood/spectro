import { type InferOutput, variant } from 'valibot';

import {
  DeserializedInteractionDataMessageComponentButtonLink,
  InteractionDataMessageComponentButtonLink,
} from './link';
import {
  DeserializedInteractionDataMessageComponentButtonNormal,
  InteractionDataMessageComponentButtonNormal,
} from './normal';
import {
  DeserializedInteractionDataMessageComponentButtonPremium,
  InteractionDataMessageComponentButtonPremium,
} from './premium';

export const InteractionDataMessageComponentButton = variant('style', [
  InteractionDataMessageComponentButtonLink,
  InteractionDataMessageComponentButtonNormal,
  InteractionDataMessageComponentButtonPremium,
]);

export type InteractionMessageComponentButton = InferOutput<
  typeof InteractionDataMessageComponentButton
>;

export const DeserializedInteractionDataMessageComponentButton = variant('component_type', [
  DeserializedInteractionDataMessageComponentButtonLink,
  DeserializedInteractionDataMessageComponentButtonNormal,
  DeserializedInteractionDataMessageComponentButtonPremium,
]);

export type DeserializedInteractionMessageComponentButton = InferOutput<
  typeof DeserializedInteractionDataMessageComponentButton
>;
