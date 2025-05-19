import { strictEqual } from 'node:assert/strict';

import type { Logger } from 'pino';
import { error } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import { IntegrationType, Webhook, WebhookEventType, WebhookType } from '$lib/server/models/discord/event';

import { handleApplicationAuthorized } from './application-authorized';

// TODO: Fine-grained database-level performance logs.
async function handleWebhook(logger: Logger, timestamp: Date, webhook: Webhook) {
    // eslint-disable-next-line default-case
    switch (webhook.type) {
        case WebhookType.Ping:
            logger.info('ping');
            break;
        case WebhookType.Event:
            strictEqual(webhook.event.type, WebhookEventType.ApplicationAuthorized);
            strictEqual(webhook.event.data.integration_type, IntegrationType.Guild);
            await handleApplicationAuthorized(logger, timestamp, webhook.event.data.guild.id);
            break;
    }
}

export async function POST({ locals: { logger }, request }) {
    const ed25519 = request.headers.get('X-Signature-Ed25519');
    if (ed25519 === null) error(400);

    const timestamp = request.headers.get('X-Signature-Timestamp');
    if (timestamp === null) error(400);

    // Used for validating the update time in interactions
    const datetime = new Date(Number.parseInt(timestamp, 10) * 1000);

    const contentType = request.headers.get('Content-Type');
    if (contentType === null || contentType !== 'application/json') error(400);

    const text = await request.text();
    const message = Buffer.from(timestamp + text);
    const signature = Buffer.from(ed25519, 'hex');

    if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
        const event = parse(Webhook, JSON.parse(text));
        logger.info({ event }, 'webhook event received');

        const start = performance.now();
        await handleWebhook(logger, datetime, event);
        const webhookTimeMillis = performance.now() - start;
        logger.info({ webhookTimeMillis }, 'webhook event processed');

        return new Response(null, { status: 204 });
    }

    error(401);
}
