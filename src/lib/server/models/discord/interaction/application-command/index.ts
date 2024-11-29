import { type InferOutput, array, literal, object, optional, string, union } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

import { InteractionApplicationCommandDataOption } from './option';

export const InteractionApplicationCommand = object({
    ...InteractionBase.entries,
    type: union([literal(InteractionType.ApplicationCommand), literal(InteractionType.ApplicationCommandAutocomplete)]),
    data: object({
        id: Snowflake,
        name: string(),
        guild_id: optional(Snowflake),
        options: optional(array(InteractionApplicationCommandDataOption)),
        // TODO: resolved
    }),
});

export type InteractionApplicationCommand = InferOutput<typeof InteractionApplicationCommand>;
