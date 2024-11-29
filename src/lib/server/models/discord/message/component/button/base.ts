import { type InferOutput, boolean, object, optional, string } from 'valibot';

export const enum MessageComponentButtonStyle {
    Primary = 1,
    Secondary,
    Success,
    Danger,
    Link,
    Premium,
}

export const MessageComponentButtonBase = object({
    label: optional(string()),
    disabled: optional(boolean()),
});

export type MessageComponentButtonBase = InferOutput<typeof MessageComponentButtonBase>;
