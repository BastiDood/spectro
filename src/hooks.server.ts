import { building } from '$app/environment';

export async function handle({ event, resolve }) {
    // Do not inject anything when pre-rendering
    if (building) return await resolve(event);

    // Dynamically imported so that the pre-renderer doesn't get confused
    const [{ db, getUserFromSessionId }, { logger }] = await Promise.all([
        import('$lib/server/database'),
        import('$lib/server/logger'),
    ]);

    event.locals.ctx = {
        db,
        logger: logger.child({
            clientAddress: event.getClientAddress(),
            method: event.request.method,
            url: event.url,
            params: event.params,
            headers: Object.fromEntries(event.request.headers.entries()),
        }),
    };

    const path = event.url.pathname;
    if (path.startsWith('/dashboard/') || path.startsWith('/oauth/discord/')) {
        const sid = event.cookies.get('sid');
        if (typeof sid !== 'undefined') {
            event.locals.ctx.session = { sid };
            // eslint-disable-next-line require-atomic-updates
            event.locals.ctx.session.user = await getUserFromSessionId(event.locals.ctx.db, sid);
        }
    }

    const start = performance.now();
    const response = await resolve(event);
    const requestTimeMillis = performance.now() - start;

    event.locals.ctx.logger.info({ requestTimeMillis });
    return response;
}
