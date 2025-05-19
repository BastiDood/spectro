import { handleFatalError, logger } from '$lib/server/logger';

export async function handle({ event, resolve }) {
    // All logged statements must reference the request ID for easy tracking.
    event.locals.logger = logger.child({ requestId: crypto.randomUUID() });
    event.locals.logger.info({
        clientAddress: event.getClientAddress(),
        method: event.request.method,
        url: event.url,
    });

    const start = performance.now();
    const response = await resolve(event);
    const requestTimeMillis = performance.now() - start;
    event.locals.logger.info({ requestTimeMillis });
    return response;
}

export function handleError({ error, event }) {
    handleFatalError(event.locals.logger, error);
}
