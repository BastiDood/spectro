import { type InferOutput, array, literal, object, optional, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * Inbound schema for FileUpload - only fields actually accessed on modal submit.
 * Discord strips: file_types, required. We also omit id (never accessed).
 */
export const MessageComponentFileUpload = object({
  /** Component type identifier. */
  type: literal(MessageComponentType.FileUpload),
  /** A developer-defined identifier for the file upload. */
  custom_id: string(),
  /** IDs of uploaded files (populated on modal submit, resolved via `resolved.attachments`). */
  values: optional(array(Snowflake)),
});

export type MessageComponentFileUpload = InferOutput<typeof MessageComponentFileUpload>;

/**
 * Outbound interface for creating a FileUpload in modals.
 * All configuration fields are available when sending.
 */
export interface CreateMessageComponentFileUpload {
  /** Component type identifier. */
  type: MessageComponentType.FileUpload;
  /** A developer-defined identifier for the file upload. */
  custom_id: string;
  /** Accepted file types (MIME types or extensions). */
  file_types?: string[];
  /** Whether the file upload requires files to be uploaded before submitting (defaults to true). */
  required?: boolean;
}
