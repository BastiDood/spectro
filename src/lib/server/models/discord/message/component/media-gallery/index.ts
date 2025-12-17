import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { UnfurledMediaItem } from '$lib/server/models/discord/message/component/unfurled-media';

/**
 * Outbound interface for a media gallery item.
 * Used as an item in MediaGallery components.
 */
export interface MediaGalleryItem {
  /** The media to display. */
  media: UnfurledMediaItem;
  /** Alt text for the media (max 1024 characters). */
  description?: string;
  /** Whether the media should be blurred out as a spoiler. */
  spoiler?: boolean;
}

/**
 * Outbound interface for a media gallery component.
 * A content component that displays 1-10 media attachments in a gallery format.
 * Each item can have optional descriptions and can be marked as spoilers.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export interface MessageComponentMediaGallery {
  /** Component type identifier. */
  type: MessageComponentType.MediaGallery;
  /** The media items to display (1-10 items). */
  items: MediaGalleryItem[];
}
