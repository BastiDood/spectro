import { Logger } from '#lib/server/telemetry/logger/index.js';

const logger = Logger.byName('health');

export function GET() {
  logger.debug('Health check requested', 'spectro.health.check');
  return new Response(null, { status: 200 });
}
