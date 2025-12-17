import { type InferOutput, object } from 'valibot';

import { Snowflake } from '$lib/server/models/discord/snowflake';
import { Timestamp } from '$lib/server/models/timestamp';

export const enum MessageFlags {
  /** Do not include embeds when serializing this message. */
  SuppressEmbeds = 1 << 2,
  /** This message is only visible to the user who created this interaction. */
  Ephemeral = 1 << 6,
  /** This message will not trigger push and desktop notifications. */
  SuppressNotifications = 1 << 12,
  /** This message uses the new Components V2 system with top-level components. */
  IsComponentsV2 = 1 << 15,
}

/**
 * Inbound schema for parsed Message responses.
 * Only includes fields that are actually accessed in the codebase.
 */
export const MessageBase = object({
  id: Snowflake,
  channel_id: Snowflake,
  timestamp: Timestamp,
});

export type MessageBase = InferOutput<typeof MessageBase>;
