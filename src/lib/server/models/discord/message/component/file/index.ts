import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { UnfurledMediaItem } from '$lib/server/models/discord/message/component/unfurled-media';

/**
 * Outbound interface for a file component.
 * A content component that displays an attached file.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export interface MessageComponentFile {
  /** Component type identifier. */
  type: MessageComponentType.File;
  /** The file to display. */
  file: UnfurledMediaItem;
  /** Whether the file should be blurred out as a spoiler. */
  spoiler?: boolean;
}
