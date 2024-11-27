import type * as schema from '$lib/server/database/models';
import { drizzle } from 'drizzle-orm/node-postgres';

import { building } from '$app/environment';

export async function handle({ event, resolve }) {
    if (!building) {
        // FIXME: Figure out a way to hoist the Drizzle database globally.
        const { POSTGRES_DATABASE_URL } = await import('$lib/server/env/postgres');
        event.locals.db = drizzle<typeof schema>(POSTGRES_DATABASE_URL);
    }
    return await resolve(event);
}
