import {
  type InferOutput,
  array,
  nullable,
  number,
  object,
  optional,
  pipe,
  safeInteger,
  string,
  transform,
} from 'valibot';

import { Embed } from '$lib/server/models/discord/embed';
import { Snowflake } from '$lib/server/models/discord/snowflake';
import { Timestamp } from '$lib/server/models/timestamp';

export const enum MessageFlags {
  /** Do not include embeds when serializing this message. */
  SuppressEmbeds = 1 << 2,
  /** This message is only visible to the user who created this interaction. */
  Ephemeral = 1 << 6,
  /** This message will not trigger push and desktop notifications. */
  SuppressNotifications = 1 << 12,
}

export const MessageBase = object({
  id: Snowflake,
  channel_id: Snowflake,
  content: string(),
  timestamp: Timestamp,
  flags: optional(
    pipe(
      number(),
      safeInteger(),
      transform(flags => flags as MessageFlags),
    ),
  ),
  edited_timestamp: nullable(Timestamp),
  embeds: optional(array(Embed)),
});

export type MessageBase = InferOutput<typeof MessageBase>;
