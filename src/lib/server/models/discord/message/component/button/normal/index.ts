import { type InferOutput, literal, object, union } from 'valibot';

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
});

export type MessageComponentButtonNormal = InferOutput<typeof MessageComponentButtonNormal>;
