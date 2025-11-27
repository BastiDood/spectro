import { EventSchemas, Inngest } from 'inngest';

import { Logger } from '$lib/server/telemetry/logger';
import { version } from '$app/environment';

export const inngest = new Inngest({
  id: 'spectro',
  optimizeParallelism: true,
  appVersion: version,
  logger: new Logger('inngest'),
  schemas: new EventSchemas().fromSchema({}),
});
