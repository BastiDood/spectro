import { type InferOutput, literal, object, string, union } from 'valibot';

import {
  MessageComponentButtonBase,
  MessageComponentButtonStyle,
} from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const MessageComponentButtonNormal = object({
  ...MessageComponentButtonBase.entries,
  type: literal(MessageComponentType.Button),
  style: union([
    literal(MessageComponentButtonStyle.Primary),
    literal(MessageComponentButtonStyle.Secondary),
    literal(MessageComponentButtonStyle.Success),
    literal(MessageComponentButtonStyle.Danger),
  ]),
  custom_id: string(),
});

export type MessageComponentButtonNormal = InferOutput<typeof MessageComponentButtonNormal>;

// HACK: Deserializing requires `component_type` instead of `type`. Wtf Discord?
export const DeserializedMessageComponentButtonNormal = object({
  ...MessageComponentButtonBase.entries,
  component_type: literal(MessageComponentType.Button),
  custom_id: string(),
});

export type DeserializedMessageComponentButtonNormal = InferOutput<
  typeof DeserializedMessageComponentButtonNormal
>;
