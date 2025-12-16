import { type InferOutput, nullish, number, object, optional, string } from 'valibot';

/**
 * Represents a media item that can be referenced by URL or attachment ID.
 * Used by Thumbnail, MediaGallery, and File components.
 */
export const UnfurledMediaItem = object({
  /** The URL of the media (external or Discord CDN). */
  url: string(),
  proxy_url: optional(string()),
  height: nullish(number()),
  width: nullish(number()),
  content_type: optional(string()),
  // TODO: attachment_id
});

export type UnfurledMediaItem = InferOutput<typeof UnfurledMediaItem>;
