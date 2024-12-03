import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';

import { DISCORD_APPLICATION_ID, DISCORD_OAUTH_REDIRECT_URI, DISCORD_OAUTH_SECRET } from '$lib/server/env/discord';
import { deletePendingSession, upgradePendingSession, upsertUser } from '$lib/server/database';
import { error, redirect } from '@sveltejs/kit';

import { TokenResponse } from '$lib/server/models/oauth/token-response';
import { User } from '$lib/server/models/discord/user';
import { parse } from 'valibot';

const DISCORD_AUTHENTICATION = btoa(`${DISCORD_APPLICATION_ID}:${DISCORD_OAUTH_SECRET}`);
const DISCORD_AUTHORIZATION = `Basic ${DISCORD_AUTHENTICATION}`;

async function exchangeAuthorizationCode(code: string) {
    const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
            Authorization: DISCORD_AUTHORIZATION,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            redirect_uri: DISCORD_OAUTH_REDIRECT_URI,
            code,
        }),
    });
    assert(response.ok);
    const json = await response.json();
    return parse(TokenResponse, json);
}

async function fetchCurrentUser(init: RequestInit) {
    const response = await fetch('https://discord.com/api/v10/users/@me', init);
    assert(response.ok);
    const json = await response.json();
    return parse(User, json);
}

export async function GET({ locals: { ctx }, url: { searchParams }, cookies, setHeaders }) {
    // Ensure that the redirect never gets cached
    setHeaders({ 'Cache-Control': 'no-store' });

    // Bounce user back to login flow if they had no session at all
    if (typeof ctx?.session === 'undefined') redirect(307, '/oauth/login/');

    // Bounce user back to the dashboard if already valid
    if (typeof ctx.session.user !== 'undefined') redirect(307, '/dashboard/');

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (code === null || state === null) {
        // Invalidate the session on malicious input
        cookies.delete('sid', { path: '/', httpOnly: true, sameSite: 'lax' });
        error(400, 'bad code and state');
    }

    const sessionId = ctx.session.sid;
    const challengedNonce = Buffer.from(state, 'base64url');
    const { sid, expires } = await ctx.db.transaction(async tx => {
        const pending = await deletePendingSession(tx, sessionId);
        if (typeof pending === 'undefined') redirect(307, '/oauth/login/');

        // Validate the CSRF token (which we only know about!)
        const hashedNonce = await crypto.subtle.digest('SHA-256', pending.nonce);
        if (challengedNonce.compare(new Uint8Array(hashedNonce)) !== 0) error(400, 'csrf challenge failed');

        const token = await exchangeAuthorizationCode(code);
        const init = { headers: { Authorization: `Bearer ${token.access_token}` } } satisfies RequestInit;
        const user = await fetchCurrentUser(init);
        await upsertUser(tx, user);

        return {
            sid: pending.id,
            expires: await upgradePendingSession(tx, pending.id, user.id, token),
        };
    });

    cookies.set('sid', sid, { path: '/', httpOnly: true, sameSite: 'lax', expires });
    redirect(307, '/dashboard/');
}
