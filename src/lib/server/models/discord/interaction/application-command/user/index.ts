import { type InferOutput, literal, object } from 'valibot';

import {
    InteractionApplicationCommandBase,
    InteractionApplicationCommandType,
} from '$lib/server/models/discord/interaction/application-command/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const InteractionApplicationCommandUser = object({
    ...InteractionApplicationCommandBase.entries,
    type: literal(InteractionApplicationCommandType.User),
    target_id: Snowflake,
    // TODO: resolved
});

export type InteractionApplicationCommandUser = InferOutput<typeof InteractionApplicationCommandUser>;
