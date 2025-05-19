import { type InferOutput, object } from 'valibot';

import {
  DeserializedMessageComponentButtonPremium,
  MessageComponentButtonPremium,
} from '$lib/server/models/discord/message/component/button/premium';
import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';

export const InteractionDataMessageComponentButtonPremium = object({
  ...InteractionDataMessageComponentBase.entries,
  ...MessageComponentButtonPremium.entries,
});

export type InteractionDataMessageComponentButtonLink = InferOutput<
  typeof InteractionDataMessageComponentButtonPremium
>;

export const DeserializedInteractionDataMessageComponentButtonPremium = object({
  ...InteractionDataMessageComponentBase.entries,
  ...DeserializedMessageComponentButtonPremium.entries,
});

export type DeserializedInteractionDataMessageComponentButtonLink = InferOutput<
  typeof DeserializedInteractionDataMessageComponentButtonPremium
>;
