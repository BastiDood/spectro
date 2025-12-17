import { type InferOutput, object, optional, string } from 'valibot';

import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * Inbound schema for Attachment from Discord API.
 * Only includes fields actually accessed in the codebase.
 */
export const Attachment = object({
  id: Snowflake,
  filename: string(),
  content_type: optional(string()),
  url: string(),
  proxy_url: string(),
});

export type Attachment = InferOutput<typeof Attachment>;
