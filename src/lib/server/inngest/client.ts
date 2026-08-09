import { extendedTracesMiddleware } from 'inngest/experimental';
import { Inngest } from 'inngest';

import { version } from '$app/environment';

import { InngestLogger } from './logger';

export const inngest = new Inngest({
  id: 'spectro',
  optimizeParallelism: true,
  checkpointing: { maxRuntime: '50s' },
  middleware: [extendedTracesMiddleware({ behaviour: 'off' })],
  appVersion: version,
  logger: new InngestLogger({}),
});
