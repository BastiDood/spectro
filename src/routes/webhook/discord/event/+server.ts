import type { Database } from '$lib/server/database';
import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import { IntegrationType, Webhook, WebhookEventType, WebhookType } from '$lib/server/models/discord/event';
import { parse } from 'valibot';

import assert, { fail, strictEqual } from 'node:assert/strict';
import { error } from '@sveltejs/kit';
import { verifyAsync } from '@noble/ed25519';

import { handleApplicationAuthorized } from './application-authorized';

async function handleWebhook(webhook: Webhook, db?: Database) {
    switch (webhook.type) {
        case WebhookType.Ping:
            break;
        case WebhookType.Event:
            assert(typeof db !== 'undefined');
            strictEqual(webhook.data.type, WebhookEventType.ApplicationAuthorized);
            strictEqual(webhook.data.data.integration_type, IntegrationType.Guild);
            await handleApplicationAuthorized(db, webhook.data.data.guild.id, webhook.data.data.guild.owner_id);
        default:
            fail(`unexpected webhook type ${webhook.type}`);
    }
}

export async function POST({ locals: { db }, request }) {
    const ed25519 = request.headers.get('X-Signature-Ed25519');
    if (ed25519 === null) error(400);

    const timestamp = request.headers.get('X-Signature-Timestamp');
    if (timestamp === null) error(400);

    const contentType = request.headers.get('Content-Type');
    if (contentType === null || contentType !== 'application/json') error(400);

    const text = await request.text();
    const message = Buffer.from(timestamp + text);
    const signature = Buffer.from(ed25519, 'hex');

    if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
        const json = JSON.parse(text);
        console.log('webhook/discord/event', json);
        await handleWebhook(parse(Webhook, json), db);
        return new Response(null, { status: 204 });
    }

    error(401);
}
