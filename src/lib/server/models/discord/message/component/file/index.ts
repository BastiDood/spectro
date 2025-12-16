import { type InferOutput, boolean, literal, number, object, optional } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { UnfurledMediaItem } from '$lib/server/models/discord/message/component/unfurled-media';

/**
 * A content component that displays an attached file.
 * Only available in messages with the IS_COMPONENTS_V2 flag.
 */
export const MessageComponentFile = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.File),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** The file to display. */
  file: UnfurledMediaItem,
  /** Whether the file should be blurred out as a spoiler. */
  spoiler: optional(boolean()),
});

export type MessageComponentFile = InferOutput<typeof MessageComponentFile>;
