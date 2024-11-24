import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { env } from '$env/dynamic/private';

assert(typeof env.DISCORD_APPLICATION_ID === 'string', 'missing discord application id');
export const DISCORD_APPLICATION_ID = env.DISCORD_APPLICATION_ID;

assert(typeof env.DISCORD_PUBLIC_KEY === 'string', 'missing discord public key');
export const DISCORD_PUBLIC_KEY = Buffer.from(env.DISCORD_PUBLIC_KEY, 'hex');
