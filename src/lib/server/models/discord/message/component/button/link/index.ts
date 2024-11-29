import { type InferOutput, literal, object } from 'valibot';

import {
    MessageComponentButtonBase,
    MessageComponentButtonStyle,
} from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const MessageComponentButtonLink = object({
    ...MessageComponentButtonBase.entries,
    type: literal(MessageComponentType.Button),
    style: literal(MessageComponentButtonStyle.Premium),
    sku_id: Snowflake,
});

export type MessageComponentButtonLink = InferOutput<typeof MessageComponentButtonLink>;
