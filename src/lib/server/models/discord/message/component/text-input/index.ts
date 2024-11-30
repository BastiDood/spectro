import {
    type InferOutput,
    boolean,
    literal,
    maxValue,
    minValue,
    number,
    object,
    optional,
    picklist,
    pipe,
    safeInteger,
    string,
} from 'valibot';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

export const enum MessageComponentTextInputStyle {
    Short = 1,
    Long = 2,
}

export const MessageComponentTextInput = object({
    type: literal(MessageComponentType.TextInput),
    custom_id: string(),
    style: picklist([MessageComponentTextInputStyle.Short, MessageComponentTextInputStyle.Long]),
    label: string(),
    min_length: optional(pipe(number(), safeInteger(), minValue(0), maxValue(4000))),
    max_length: optional(pipe(number(), safeInteger(), minValue(1), maxValue(4000))),
    required: optional(boolean()),
    value: optional(string()),
    placeholder: optional(string()),
});

export type MessageComponentTextInput = InferOutput<typeof MessageComponentTextInput>;
