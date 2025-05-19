export function GET({ locals: { logger } }) {
  logger.trace('health check pinged');
  return new Response(null, { status: 200 });
}
