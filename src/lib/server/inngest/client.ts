import { extendedTracesMiddleware } from 'inngest/experimental';
import { Inngest } from 'inngest';

import { Logger } from '$lib/server/telemetry/logger';
import { version } from '$app/environment';

const logger = Logger.byName('inngest');

type InngestLogSeverity = 'debug' | 'info' | 'warn' | 'error';

function findInngestError(args: readonly unknown[]) {
  for (const argument of args) {
    if (Error.isError(argument)) return argument;
    if (typeof argument !== 'object' || argument === null) continue;
    if ('err' in argument && Error.isError(argument.err)) return argument.err;
  }
}

function logInngest(severity: InngestLogSeverity, args: readonly unknown[]) {
  const body = args.find(argument => typeof argument === 'string');
  logger[severity](
    body ?? 'Inngest emitted a log',
    'spectro.inngest.log',
    void 0,
    findInngestError(args),
  );
}

export const inngest = new Inngest({
  id: 'spectro',
  optimizeParallelism: true,
  checkpointing: { maxRuntime: '50s' },
  middleware: [extendedTracesMiddleware({ behaviour: 'off' })],
  appVersion: version,
  logger: {
    debug(...args) {
      logInngest('debug', args);
    },
    info(...args) {
      logInngest('info', args);
    },
    warn(...args) {
      logInngest('warn', args);
    },
    error(...args) {
      logInngest('error', args);
    },
  },
});
