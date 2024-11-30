import { type InferOutput, object, optional } from 'valibot';

import type { AllowedMentions } from '$lib/server/models/discord/allowed-mentions';

import { MessageBase } from './base';
import { MessageComponents } from './component';
import { MessageReference } from './reference';

export const Message = object({
    ...MessageBase.entries,
    components: optional(MessageComponents),
    message_reference: optional(MessageReference),
});

export type Message = InferOutput<typeof Message>;

export interface CreateMessage {
    allowed_mentions?: Partial<AllowedMentions>;
    embeds?: Message['embeds'];
    message_reference?: Message['message_reference'];
}
