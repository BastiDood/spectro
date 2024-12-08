import { type InferOutput, boolean, nullable, object, optional, string } from 'valibot';

import { Snowflake } from '$lib/server/models/discord/snowflake';

export const Emoji = object({
    id: optional(nullable(Snowflake)),
    name: nullable(string()),
    require_colons: optional(boolean()),
    managed: optional(boolean()),
    animated: optional(boolean()),
    available: optional(boolean()),
});

export type Emoji = InferOutput<typeof Emoji>;
