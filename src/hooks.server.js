import { Logger } from '#lib/server/telemetry/logger/index.js';

const logger = Logger.byName('hooks');

export function handleError({ error }) {
  if (error instanceof Error)
    logger.error('Unhandled SvelteKit error', 'spectro.sveltekit.request.exception', void 0, error);
  else logger.error('Unhandled SvelteKit error', 'spectro.sveltekit.request.failure');
}
