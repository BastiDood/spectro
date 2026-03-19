import { Inngest } from 'inngest';
import { extendedTracesMiddleware } from 'inngest/experimental';
import { Logger } from '$lib/server/telemetry/logger';
import { version } from '$app/environment';

export const inngest = new Inngest({
  id: 'spectro',
  optimizeParallelism: true,
  checkpointing: { maxRuntime: '50s' },
  middleware: [extendedTracesMiddleware({ behaviour: 'off' })],
  appVersion: version,
  logger: Logger.byName('inngest'),
});
