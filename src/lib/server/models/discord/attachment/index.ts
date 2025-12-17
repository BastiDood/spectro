import { type InferOutput, nullable, number, object, optional, pick, string } from 'valibot';

import { Snowflake } from '$lib/server/models/discord/snowflake';

export const Attachment = object({
  id: Snowflake,
  filename: string(),
  title: optional(string()),
  description: optional(string()),
  content_type: optional(string()),
  size: number(),
  url: string(),
  proxy_url: string(),
  height: optional(nullable(number())),
  width: optional(nullable(number())),
});

// use this limited attachment when retrieving from db for embedding in a message
export const EmbedAttachment = pick(Attachment, [
  'filename',
  'url',
  'content_type',
  'height',
  'width',
]);

export type Attachment = InferOutput<typeof Attachment>;
export type EmbedAttachment = InferOutput<typeof EmbedAttachment>;
