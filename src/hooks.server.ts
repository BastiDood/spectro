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

    // eslint-disable-next-line init-declarations
    let response: Response;

    const start = performance.now();
    try {
        response = await resolve(event);
    } catch (err) {
        if (isValiError(err)) {
            const valibotErrorPaths = err.issues.map(issue => getDotPath(issue)).filter(path => path !== null);
            event.locals.ctx.logger.fatal({ valibotError: err, valibotErrorPaths }, 'valibot validation failed');
        } else if (err instanceof AssertionError) {
            event.locals.ctx.logger.fatal({ nodeAssertionError: err }, 'assertion error encountered');
        } else {
            event.locals.ctx.logger.fatal(err, 'unknown error encountered');
        }
        throw err;
    } finally {
        const requestTimeMillis = performance.now() - start;
        event.locals.ctx.logger.info({ requestTimeMillis });
    }

    return response;
}
