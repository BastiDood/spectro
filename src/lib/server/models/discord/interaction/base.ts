import { GuildMember } from '$lib/server/models/discord/guild-member';
import { Message } from '$lib/server/models/discord/message';
import { Snowflake } from '$lib/server/models/discord/snowflake';

import { type InferOutput, literal, object, optional, string } from 'valibot';

export const enum InteractionType {
    Ping = 1,
    ApplicationCommand = 2,
    MessageComponent = 3,
    ApplicationCommandAutocomplete = 4,
    ModalSubmit = 5,
}

export const InteractionBase = object({
    version: literal(1),
    id: Snowflake,
    application_id: Snowflake,
    guild_id: optional(Snowflake),
    channel_id: optional(Snowflake),
    token: string(),
    member: optional(GuildMember),
    message: optional(Message),
});

export type InteractionBase = InferOutput<typeof InteractionBase>;
