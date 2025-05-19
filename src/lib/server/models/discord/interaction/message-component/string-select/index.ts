import { type InferOutput, array, literal, object, string } from 'valibot';

import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const InteractionDataMessageComponentStringSelect = object({
  ...InteractionDataMessageComponentBase.entries,
  type: literal(MessageComponentType.StringSelect),
  values: array(string()),
});

export type InteractionDataMessageComponentStringSelect = InferOutput<
  typeof InteractionDataMessageComponentStringSelect
>;

export const DeserializedInteractionDataMessageComponentStringSelect = object({
  ...InteractionDataMessageComponentBase.entries,
  component_type: literal(MessageComponentType.StringSelect),
  values: array(string()),
});

export type DeserializedInteractionDataMessageComponentStringSelect = InferOutput<
  typeof InteractionDataMessageComponentStringSelect
>;
