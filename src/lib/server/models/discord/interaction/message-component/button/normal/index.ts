import { type InferOutput, object } from 'valibot';

import {
  DeserializedMessageComponentButtonNormal,
  MessageComponentButtonNormal,
} from '$lib/server/models/discord/message/component/button/normal';
import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';

export const InteractionDataMessageComponentButtonNormal = object({
  ...InteractionDataMessageComponentBase.entries,
  ...MessageComponentButtonNormal.entries,
});

export type InteractionDataMessageComponentButtonNormal = InferOutput<
  typeof InteractionDataMessageComponentButtonNormal
>;

export const DeserializedInteractionDataMessageComponentButtonNormal = object({
  ...InteractionDataMessageComponentBase.entries,
  ...DeserializedMessageComponentButtonNormal.entries,
});

export type DeserializedInteractionDataMessageComponentButtonNormal = InferOutput<
  typeof DeserializedInteractionDataMessageComponentButtonNormal
>;
