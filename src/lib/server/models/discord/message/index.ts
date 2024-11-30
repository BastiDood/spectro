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

import type { AllowedMentions } from '$lib/server/models/discord/allowed-mentions';
import { Embed } from '$lib/server/models/discord/embed';
import { Snowflake } from '$lib/server/models/discord/snowflake';
import { Timestamp } from '$lib/server/models/timestamp';

import { MessageComponents } from './component';
import type { MessageFlags } from './base';

export const Message = object({
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
    components: optional(MessageComponents),
    embeds: optional(array(Embed)),
});

export type Message = InferOutput<typeof Message>;

export interface CreateMessage {
    allowed_mentions?: Partial<AllowedMentions>;
    embeds: Message['embeds'];
}
