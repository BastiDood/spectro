import { Logger } from '#lib/server/telemetry/logger/index.ts';

const logger = Logger.byName('hooks');

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
