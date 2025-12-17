/**
 * Outbound interface for media items in Thumbnail, MediaGallery, and File components.
 * Only url is needed when sending - Discord returns proxy_url, height, width, content_type.
 */
export interface UnfurledMediaItem {
  /** The URL of the media (external or Discord CDN). */
  url: string;
}
