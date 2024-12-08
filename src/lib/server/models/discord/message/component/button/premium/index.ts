import { type InferOutput, literal, object, string } from 'valibot';

import {
    MessageComponentButtonBase,
    MessageComponentButtonStyle,
} from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const MessageComponentButtonPremium = object({
    ...MessageComponentButtonBase.entries,
    type: literal(MessageComponentType.Button),
    style: literal(MessageComponentButtonStyle.Premium),
    sku_id: string(),
});

export type MessageComponentButtonPremium = InferOutput<typeof MessageComponentButtonPremium>;

// HACK: Deserializing requires `component_type` instead of `type`. Wtf Discord?
export const DeserializedMessageComponentButtonPremium = object({
    ...MessageComponentButtonBase.entries,
    component_type: literal(MessageComponentType.Button),
    sku_id: string(),
});

export type DeserializedMessageComponentButtonPremium = InferOutput<typeof DeserializedMessageComponentButtonPremium>;
