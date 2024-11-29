import { type InferOutput, literal, object, string } from 'valibot';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const MessageComponentTextInput = object({
    type: literal(MessageComponentType.TextInput),
    custom_id: string(),
    value: string(),
});

export type MessageComponentTextInput = InferOutput<typeof MessageComponentTextInput>;
