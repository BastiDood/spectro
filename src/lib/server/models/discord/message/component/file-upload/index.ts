import { type InferOutput, array, literal, number, object, optional, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * An interactive component for uploading files in modals.
 * Only available in modals.
 */
export const MessageComponentFileUpload = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.FileUpload),
  /** Optional identifier for the component. */
  id: optional(number()),
  /** A developer-defined identifier for the file upload. */
  custom_id: string(),
  /** Accepted file types (MIME types or extensions). */
  file_types: optional(array(string())),
  /** IDs of uploaded files (populated on modal submit, resolved via `resolved.attachments`). */
  values: optional(array(Snowflake)),
});

export type MessageComponentFileUpload = InferOutput<typeof MessageComponentFileUpload>;
