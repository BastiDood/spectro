import { Logger } from '$lib/server/telemetry/logger';

const logger = Logger.byName('health');

export function GET() {
  logger.debug('health check pinged');
  return new Response(null, { status: 200 });
}
