import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import { Buffer } from 'node:buffer';
import { fail } from 'node:assert/strict';

import {
    Interaction,
    type InteractionCallback,
    InteractionCallbackType,
    InteractionType,
} from '$lib/server/models/discord/interaction';

import { error, json } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

function handleInteraction(interaction: Interaction): InteractionCallback {
    switch (interaction.type) {
        case InteractionType.Ping:
            return { type: InteractionCallbackType.Pong } as const;
        case InteractionType.ApplicationCommand:
            fail('not yet implemented');
            break;
        case InteractionType.MessageComponent:
            fail('not yet implemented');
            break;
        default:
            fail(`unexpected interaction type ${interaction.type}`);
            break;
    }
}

export async function POST({ request }) {
    const ed25519 = request.headers.get('X-Signature-Ed25519');
    if (ed25519 === null) error(400);

    const timestamp = request.headers.get('X-Signature-Timestamp');
    if (timestamp === null) error(400);

    const contentType = request.headers.get('Content-Type');
    if (contentType === null || contentType !== 'application/json') error(400);

    const text = await request.text();
    const message = Buffer.from(timestamp + text);
    const signature = Buffer.from(ed25519, 'hex');

    const isVerified = await verifyAsync(signature, message, DISCORD_PUBLIC_KEY);
    if (!isVerified) error(401);

    const interaction = parse(Interaction, JSON.parse(text));
    const callback = handleInteraction(interaction);
    return json(callback);
}
