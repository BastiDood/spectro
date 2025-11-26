import { Logger } from '$lib/server/telemetry/logger';

const logger = new Logger('health');

export function GET() {
  logger.debug('health check pinged');
  return new Response(null, { status: 200 });
}
