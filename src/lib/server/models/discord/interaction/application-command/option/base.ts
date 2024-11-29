import { type InferOutput, object, string } from 'valibot';

export const enum InteractionApplicationCommandDataOptionType {
    SubCommand = 1,
    SubCommandGroup,
    String,
    Integer,
    Boolean,
    User,
    Channel,
    Role,
    Mentionable,
    Number,
    Attachment,
}

export const InteractionApplicationCommandDataOptionBase = object({ name: string() });

export type InteractionApplicationCommandDataOptionBase = InferOutput<
    typeof InteractionApplicationCommandDataOptionBase
>;
