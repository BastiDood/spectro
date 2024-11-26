import { building, dev } from '$app/environment';

import assert from 'node:assert/strict';
import { env } from '$env/dynamic/private';

if (!building && !dev) assert(typeof env.POSTGRES_DATABASE_URL === 'string', 'missing postgres database url');

export const POSTGRES_DATABASE_URL = env.POSTGRES_DATABASE_URL ?? '';
