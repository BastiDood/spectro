import type { AllowedMentions } from '#lib/server/models/discord/allowed-mentions.ts';
import { array, type InferOutput, object, optional } from 'valibot';
import { Attachment } from '#lib/server/models/discord/attachment/index.ts';
import { Channel } from '#lib/server/models/discord/channel.ts';
import { Embed } from '#lib/server/models/discord/embed.ts';

import { MessageBase, MessageFlags } from './base.ts';

import type { MessageComponent } from './component/index.ts';
import type { MessageReference } from './reference/index.ts';

/**
 * Inbound schema for parsed Message responses.
 * Only includes fields that are actually accessed in the codebase.
 */
export const Message = object({
  ...MessageBase.entries,
  attachments: optional(array(Attachment)),
  embeds: optional(array(Embed)),
  thread: optional(Channel),
});

export type Message = InferOutput<typeof Message>;

export interface CreateMessageAttachment {
  id: number | string;
  filename: string;
  description?: string;
}

/**
 * Outbound interface for creating messages.
 * Includes all fields needed when sending to Discord.
 */
export interface CreateMessage {
  content?: string;
  nonce?: string;
  enforce_nonce?: boolean;
  /** Bitwise OR of {@linkcode MessageFlags} members. */
  flags?: MessageFlags | (number & {});
  allowed_mentions?: Partial<AllowedMentions>;
  embeds?: Embed[];
  components?: MessageComponent[];
  message_reference?: MessageReference;
  attachments?: CreateMessageAttachment[];
}
