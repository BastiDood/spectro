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
