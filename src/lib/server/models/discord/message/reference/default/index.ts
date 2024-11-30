import { type InferOutput, literal, object, optional } from 'valibot';

import { MessageReferenceBase, MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const MessageReferenceDefault = object({
    ...MessageReferenceBase.entries,
    type: literal(MessageReferenceType.Default),
    channel_id: optional(Snowflake),
});

export type MessageReferenceDefault = InferOutput<typeof MessageReferenceDefault>;
