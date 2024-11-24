import { type InferOutput, literal, object, string } from 'valibot';
import { Snowflake } from './snowflake';

export const enum WebhookType {
    Incoming = 1,
    ChannelFollower = 2,
    Application = 3,
}

export const IncomingWebhook = object({
    id: Snowflake,
    type: literal(WebhookType.Incoming),
    token: string(),
});

export type IncomingWebhook = InferOutput<typeof IncomingWebhook>;
