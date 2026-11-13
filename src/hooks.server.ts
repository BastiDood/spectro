import { ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { Logger } from '#lib/server/telemetry/logger/index.ts';

const logger = Logger.byName('hooks');

export async function handle({ event, resolve }) {
  event.tracing.root.setAttribute(ATTR_URL_PATH, event.url.pathname);
  return await resolve(event);
}

export function handleError({ kind, error }) {
  // Expected app errors are logged where they are thrown, and framework errors (e.g., 404) are routine.
  if (kind === 'unknown')
    if (Error.isError(error))
      logger.error(
        'Unhandled SvelteKit error',
        'spectro.sveltekit.request.exception',
        void 0,
        error,
      );
    else logger.error('Unhandled SvelteKit error', 'spectro.sveltekit.request.failure');
}
