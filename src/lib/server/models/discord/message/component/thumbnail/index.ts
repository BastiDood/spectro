import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { UnfurledMediaItem } from '$lib/server/models/discord/message/component/unfurled-media';

/**
 * Outbound interface for a thumbnail component.
 * A content component that displays visual media in a small form-factor.
 * Intended as an accessory to other content, primarily in sections.
 * Supports images including animated formats (GIF, WEBP). Videos are not supported.
 */
export interface MessageComponentThumbnail {
  /** Component type identifier. */
  type: MessageComponentType.Thumbnail;
  /** The media to display. */
  media: UnfurledMediaItem;
  /** Alt text for the media (max 1024 characters). */
  description?: string;
  /** Whether the thumbnail should be blurred out as a spoiler. */
  spoiler?: boolean;
}
