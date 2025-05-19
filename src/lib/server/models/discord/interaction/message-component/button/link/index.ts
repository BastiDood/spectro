import { type InferOutput, object } from 'valibot';

import {
  DeserializedMessageComponentButtonLink,
  MessageComponentButtonLink,
} from '$lib/server/models/discord/message/component/button/link';
import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';

export const InteractionDataMessageComponentButtonLink = object({
  ...InteractionDataMessageComponentBase.entries,
  ...MessageComponentButtonLink.entries,
});

export type InteractionDataMessageComponentButtonLink = InferOutput<
  typeof InteractionDataMessageComponentButtonLink
>;

export const DeserializedInteractionDataMessageComponentButtonLink = object({
  ...InteractionDataMessageComponentBase.entries,
  ...DeserializedMessageComponentButtonLink.entries,
});

export type DeserializedInteractionDataMessageComponentButtonLink = InferOutput<
  typeof DeserializedInteractionDataMessageComponentButtonLink
>;
