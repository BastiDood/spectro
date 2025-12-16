import {
  type InferOutput,
  array,
  boolean,
  literal,
  maxLength,
  minLength,
  number,
  object,
  optional,
  pipe,
  string,
} from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { UnfurledMediaItem } from '$lib/server/models/discord/message/component/unfurled-media';

/**
 * Media item with optional description and spoiler settings.
 * Used as an item in MediaGallery components.
 */
export const MediaGalleryItem = object({
  /** The media to display. */
  media: UnfurledMediaItem,
  /** Alt text for the media (max 1024 characters). */
  description: optional(string()),
  /** Whether the media should be blurred out as a spoiler. */
  spoiler: optional(boolean()),
});

export type MediaGalleryItem = InferOutput<typeof MediaGalleryItem>;

/**
 * A content component that displays 1-10 media attachments in a gallery format.
 * Each item can have optional descriptions and can be marked as spoilers.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export const MessageComponentMediaGallery = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.MediaGallery),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** The media items to display (1-10 items). */
  items: pipe(array(MediaGalleryItem), minLength(1), maxLength(10)),
});

export type MessageComponentMediaGallery = InferOutput<typeof MessageComponentMediaGallery>;
