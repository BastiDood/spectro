import { type InferOutput, nullable, number, object, optional, string } from 'valibot';
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

export type Attachment = InferOutput<typeof Attachment>;
