import { type InferOutput, boolean, object, optional } from 'valibot';

import { Snowflake } from '$lib/server/models/discord/snowflake';

export const enum MessageReferenceType {
  Default = 0,
  Forward = 1,
}

export const MessageReferenceBase = object({
  message_id: optional(Snowflake),
  guild_id: optional(Snowflake),
  fail_if_not_exists: optional(boolean()),
});

export type MessageReferenceBase = InferOutput<typeof MessageReferenceBase>;
