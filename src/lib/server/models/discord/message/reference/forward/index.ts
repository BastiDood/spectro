import { type InferOutput, literal, object } from 'valibot';

import { MessageReferenceBase, MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const MessageReferenceForward = object({
    ...MessageReferenceBase.entries,
    type: literal(MessageReferenceType.Forward),
    channel_id: Snowflake,
});

export type MessageReferenceForward = InferOutput<typeof MessageReferenceForward>;
