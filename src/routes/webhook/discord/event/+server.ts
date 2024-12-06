import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import { IntegrationType, Webhook, WebhookEventType, WebhookType } from '$lib/server/models/discord/event';
import { parse } from 'valibot';

import assert, { strictEqual } from 'node:assert/strict';
import { error } from '@sveltejs/kit';
import { verifyAsync } from '@noble/ed25519';

import { type Database, upsertGuild, upsertUser } from '$lib/server/database';
import type { Logger } from 'pino';
import { handleApplicationAuthorized } from './application-authorized';

// TODO: Fine-grained database-level performance logs.
async function handleWebhook(db: Database, logger: Logger, webhook: Webhook, timestamp: Date) {
    // eslint-disable-next-line default-case
    switch (webhook.type) {
        case WebhookType.Ping:
            logger.info('ping');
            break;
        case WebhookType.Event:
            strictEqual(webhook.event.type, WebhookEventType.ApplicationAuthorized);
            strictEqual(webhook.event.data.integration_type, IntegrationType.Guild);
            await upsertUser(db, webhook.event.data.user, timestamp);
            // TODO: Merge the new guild insert with the permission insert.
            await upsertGuild(db, webhook.event.data.guild, timestamp);
            // FIXME: Is this really the most secure way to do this?
            await handleApplicationAuthorized(db, logger, webhook.event.data.guild.id, webhook.event.data.user.id);
            break;
    }
}

export async function POST({ locals: { ctx }, request }) {
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
        const event = JSON.parse(text);
        assert(typeof ctx !== 'undefined');
        const logger = ctx.logger.child({ event });
        logger.info('webhook event received');
        const parsed = parse(Webhook, event);

        const start = performance.now();
        await handleWebhook(ctx.db, logger, parsed, datetime);
        const webhookTimeMillis = performance.now() - start;
        logger.info({ webhookTimeMillis }, 'webhook event processed');

        return new Response(null, { status: 204 });
    }

    error(401);
}
