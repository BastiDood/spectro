import { extendedTracesMiddleware } from 'inngest/experimental';
import { Inngest } from 'inngest';

import { version } from '$app/env';

import { InngestLogger } from './logger.ts';

const logger = new InngestLogger({});

export const inngest = new Inngest({
  id: 'spectro',
  optimizeParallelism: true,
  checkpointing: { maxRuntime: '50s' },
  middleware: [extendedTracesMiddleware({ behaviour: 'off' })],
  appVersion: version,
  logger,
  internalLogger: logger,
});
