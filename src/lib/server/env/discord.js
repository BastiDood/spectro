import { building, dev } from '$app/environment';

import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { env } from '$env/dynamic/private';

if (!building && !dev) {
    assert(typeof env.DISCORD_APPLICATION_ID === 'string', 'missing discord application id');
    assert(typeof env.DISCORD_OAUTH_SECRET === 'string', 'missing discord oauth secret');
    assert(typeof env.DISCORD_OAUTH_REDIRECT_URI === 'string', 'missing discord oauth redirect uri');
    assert(typeof env.DISCORD_PUBLIC_KEY === 'string', 'missing discord public key');
    assert(typeof env.DISCORD_BOT_TOKEN === 'string', 'missing discord bot token');
}

export const DISCORD_APPLICATION_ID = env.DISCORD_APPLICATION_ID ?? '';
export const DISCORD_OAUTH_SECRET = env.DISCORD_OAUTH_SECRET ?? '';
export const DISCORD_OAUTH_REDIRECT_URI = env.DISCORD_OAUTH_REDIRECT_URI ?? '';
export const DISCORD_PUBLIC_KEY = Buffer.from(env.DISCORD_PUBLIC_KEY ?? '', 'hex');
export const DISCORD_BOT_TOKEN = env.DISCORD_BOT_TOKEN ?? '';
