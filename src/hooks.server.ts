import { building } from '$app/environment';
import { getUserFromSessionId } from '$lib/server/database';

export async function handle({ event, resolve }) {
    if (!building) {
        const { db } = await import('$lib/server/database');
        event.locals.ctx = { db };

        const path = event.url.pathname;
        if (path.startsWith('/dashboard/') || path.startsWith('/oauth/discord/')) {
            const sid = event.cookies.get('sid');
            if (typeof sid !== 'undefined')
                // eslint-disable-next-line require-atomic-updates
                event.locals.ctx.user = await getUserFromSessionId(event.locals.ctx.db, sid);
        }
    }

    return await resolve(event);
}
