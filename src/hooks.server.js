import { Logger } from '$lib/server/telemetry/logger';

const logger = Logger.byName('hooks');

export function handleError({ error }) {
  if (error instanceof Error) logger.fatal('unhandled error', error);
  else logger.fatal('unhandled error');
}
