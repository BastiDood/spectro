import { type InferOutput, boolean, literal, number, object, optional, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { UnfurledMediaItem } from '$lib/server/models/discord/message/component/unfurled-media';

/**
 * A content component that displays visual media in a small form-factor.
 * Intended as an accessory to other content, primarily in sections.
 * Supports images including animated formats (GIF, WEBP). Videos are not supported.
 */
export const MessageComponentThumbnail = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.Thumbnail),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** The media to display. */
  media: UnfurledMediaItem,
  /** Alt text for the media (max 1024 characters). */
  description: optional(string()),
  /** Whether the thumbnail should be blurred out as a spoiler. */
  spoiler: optional(boolean()),
});

export type MessageComponentThumbnail = InferOutput<typeof MessageComponentThumbnail>;
