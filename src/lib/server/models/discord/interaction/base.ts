import { GuildMember } from '$lib/server/models/discord/guild-member';
import { Snowflake } from '$lib/server/models/discord/snowflake';

import { type InferOutput, literal, object, optional, string } from 'valibot';

export const enum InteractionType {
    Ping = 1,
    ApplicationCommand,
    MessageComponent,
    ApplicationCommandAutocomplete,
    ModalSubmit,
}

export const InteractionBase = object({
    version: literal(1),
    id: Snowflake,
    application_id: Snowflake,
    guild_id: optional(Snowflake),
    channel_id: optional(Snowflake),
    token: string(),
    member: optional(GuildMember),
});

export type InteractionBase = InferOutput<typeof InteractionBase>;
