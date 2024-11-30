import { type InferOutput, array, literal, object, string, variant } from 'valibot';
import { Guild } from './guild';
import { Snowflake } from './snowflake';
import { User } from './user';

import { Timestamp } from '$lib/server/models/timestamp';

const BaseWebhook = object({
    version: literal(1),
    application_id: Snowflake,
});

export const enum WebhookType {
    Ping = 0,
    Event = 1,
}

export const enum WebhookEventType {
    ApplicationAuthorized = 'APPLICATION_AUTHORIZED',
    EntitlementCreate = 'ENTITLEMENT_CREATE',
    QuestUserEnrollment = 'QUEST_USER_ENROLLMENT',
}

export const BaseWebhookEvent = object({ timestamp: Timestamp });

export const enum IntegrationType {
    Guild = 0,
    User = 1,
}

export const BaseWebhookEventApplicationAuthorizedData = object({
    user: User,
    scopes: array(string()),
});

export const Webhook = variant('type', [
    object({
        ...BaseWebhook.entries,
        type: literal(WebhookType.Ping),
    }),
    object({
        ...BaseWebhook.entries,
        type: literal(WebhookType.Event),
        event: variant('type', [
            object({
                ...BaseWebhookEvent.entries,
                type: literal(WebhookEventType.ApplicationAuthorized),
                data: variant('integration_type', [
                    object({
                        ...BaseWebhookEventApplicationAuthorizedData.entries,
                        integration_type: literal(IntegrationType.Guild),
                        guild: Guild,
                    }),
                    object({
                        ...BaseWebhookEventApplicationAuthorizedData.entries,
                        integration_type: literal(IntegrationType.User),
                    }),
                ]),
            }),
        ]),
    }),
]);

export type Webhook = InferOutput<typeof Webhook>;
