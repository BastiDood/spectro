import { array, type InferOutput, object, optional } from 'valibot';

import type { AllowedMentions } from '$lib/server/models/discord/allowed-mentions';
import { Attachment } from '$lib/server/models/discord/attachment';
import type { Embed } from '$lib/server/models/discord/embed';

import { MessageBase, MessageFlags } from './base';
import type { MessageComponent } from './component';
import type { MessageReference } from './reference';

/**
 * Inbound schema for parsed Message responses.
 * Only includes fields that are actually accessed in the codebase.
 */
export const Message = object({
  ...MessageBase.entries,
  attachments: optional(array(Attachment)),
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
  flags?: MessageFlags;
  allowed_mentions?: Partial<AllowedMentions>;
  embeds?: Embed[];
  components?: MessageComponent[];
  message_reference?: MessageReference;
  attachments?: CreateMessageAttachment[];
}
