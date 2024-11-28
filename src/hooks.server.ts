import { building } from '$app/environment';

export async function handle({ event, resolve }) {
    if (!building) {
        const { db } = await import('$lib/server/database');
        event.locals.db = db;
    }
    return await resolve(event);
}
