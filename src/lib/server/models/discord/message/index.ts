import { type InferOutput, array, object, optional } from 'valibot';

import type { AllowedMentions } from '$lib/server/models/discord/allowed-mentions';

import { Attachment } from '../attachment';
import { MessageBase } from './base';
import { MessageComponents } from './component';
import { MessageReference } from './reference';

export const Message = object({
  ...MessageBase.entries,
  components: optional(MessageComponents),
  message_reference: optional(MessageReference),
  attachments: optional(array(Attachment)),
});

export type Message = InferOutput<typeof Message>;

export interface CreateMessage {
  content?: Message['content'];
  flags?: Message['flags'];
  allowed_mentions?: Partial<AllowedMentions>;
  embeds?: Message['embeds'];
  components?: Message['components'];
  message_reference?: Message['message_reference'];
  attachments?: Message['attachments'];
}
