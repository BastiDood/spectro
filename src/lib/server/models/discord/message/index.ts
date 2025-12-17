import { type InferOutput, object } from 'valibot';

import type { AllowedMentions } from '$lib/server/models/discord/allowed-mentions';
import type { Embed } from '$lib/server/models/discord/embed';

import type { Attachment } from '../attachment';
import { MessageBase, MessageFlags } from './base';
import type { MessageComponent } from './component';
import type { MessageReference } from './reference';

/**
 * Inbound schema for parsed Message responses.
 * Only includes fields that are actually accessed in the codebase.
 */
export const Message = object({
  ...MessageBase.entries,
});

export type Message = InferOutput<typeof Message>;

/**
 * Outbound interface for creating messages.
 * Includes all fields needed when sending to Discord.
 */
export interface CreateMessage {
  content?: string;
  flags?: MessageFlags;
  allowed_mentions?: Partial<AllowedMentions>;
  embeds?: Embed[];
  components?: MessageComponent[];
  message_reference?: MessageReference;
  attachments?: Attachment[];
}
