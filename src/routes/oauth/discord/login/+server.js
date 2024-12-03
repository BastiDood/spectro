import assert from 'node:assert/strict';

import { DISCORD_APPLICATION_ID, DISCORD_OAUTH_REDIRECT_URI } from '$lib/server/env/discord';
import { generatePendingSession } from '$lib/server/database';
import { redirect } from '@sveltejs/kit';

export async function GET({ locals: { ctx }, cookies, setHeaders }) {
    // Ensure that the redirect never gets cached
    setHeaders({ 'Cache-Control': 'no-store' });

    // Bounce user back to the dashboard if already valid
    if (typeof ctx?.session?.user !== 'undefined') redirect(307, '/dashboard/');

    assert(typeof ctx?.db !== 'undefined');
    const pending = await generatePendingSession(ctx.db);
    cookies.set('sid', pending.id, { path: '/', httpOnly: true, sameSite: 'lax', expires: pending.expiresAt });

    // Hash of the pending session nonce serves as our CSRF token
    const hashedNonce = await crypto.subtle.digest('SHA-256', pending.nonce);

    // https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-authorization-url-example
    const params = new URLSearchParams({
        state: Buffer.from(hashedNonce).toString('base64url'),
        client_id: DISCORD_APPLICATION_ID,
        redirect_uri: DISCORD_OAUTH_REDIRECT_URI,
        scope: 'guilds',
        response_type: 'code',
        prompt: 'none',
    });

    redirect(307, `https://discord.com/oauth2/authorize?${params}`);
}
