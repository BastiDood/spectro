import { type InferOutput, boolean, object, optional, string } from 'valibot';

export const enum MessageComponentButtonStyle {
    Primary = 1,
    Secondary = 2,
    Success = 3,
    Danger = 4,
    Link = 5,
    Premium = 6,
}

export const MessageComponentButtonBase = object({
    label: optional(string()),
    disabled: optional(boolean()),
});

export type MessageComponentButtonBase = InferOutput<typeof MessageComponentButtonBase>;
