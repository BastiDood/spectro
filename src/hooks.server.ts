import { AssertionError } from 'node:assert';

import { building } from '$app/environment';

import { getDotPath, isValiError } from 'valibot';

export async function handle({ event, resolve }) {
    // Do not inject anything when pre-rendering
    if (building) return await resolve(event);

    // Dynamically imported so that the pre-renderer doesn't get confused
    const [{ db }, { logger }] = await Promise.all([import('$lib/server/database'), import('$lib/server/logger')]);

    event.locals.ctx = {
        db,
        logger: logger.child({
            clientAddress: event.getClientAddress(),
            method: event.request.method,
            url: event.url,
        }),
    };

    const start = performance.now();
    const response = await resolve(event);
    const requestTimeMillis = performance.now() - start;
    event.locals.ctx.logger.info({ requestTimeMillis });
    return response;
}

export function handleError({ error, event }) {
    if (typeof event.locals.ctx !== 'undefined') {
        if (isValiError(error)) {
            const valibotErrorPaths = error.issues.map(issue => getDotPath(issue)).filter(path => path !== null);
            event.locals.ctx.logger.fatal({ valibotErrorPaths }, error.message);
        } else if (error instanceof AssertionError) {
            event.locals.ctx.logger.fatal({ nodeAssertionError: error }, error.message);
        } else if (error instanceof Error) {
            event.locals.ctx.logger.fatal({ error }, error.message);
        } else {
            event.locals.ctx.logger.fatal({ unknownError: error });
        }
    }
    throw error;
}
