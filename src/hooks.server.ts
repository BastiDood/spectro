import { POSTGRES_DATABASE_URL } from '$lib/server/env/postgres';

import type * as schema from '$lib/server/database/models';
import { drizzle } from 'drizzle-orm/node-postgres';

import { building } from '$app/environment';

const db = building ? null : drizzle<typeof schema>(POSTGRES_DATABASE_URL);
export async function handle({ event, resolve }) {
    if (db !== null) event.locals.db = db;
    return await resolve(event);
}
