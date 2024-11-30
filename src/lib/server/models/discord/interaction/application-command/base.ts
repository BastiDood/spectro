import { type InferOutput, object, string } from 'valibot';

export const enum InteractionApplicationCommandType {
    ChatInput = 1,
    User = 2,
    Message = 3,
    PrimaryEntryPoint = 4,
}

export const InteractionApplicationCommandBase = object({ name: string() });

export type InteractionApplicationCommandBase = InferOutput<typeof InteractionApplicationCommandBase>;
