import { type InferOutput, nullable, number, object, optional, string } from 'valibot';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const Attachment = object({
    id: Snowflake,
    filename: string(),
    title: optional(string()),
    description: optional(string()),
    content_type: nullable(optional(string())),
    size: optional(number()),
    url: string(),
    proxy_url: optional(string()),
    height: optional(nullable(number())),
    width: optional(nullable(number())),
});

export type Attachment = InferOutput<typeof Attachment>;
