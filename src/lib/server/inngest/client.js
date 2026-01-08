import { EventSchemas, Inngest } from 'inngest';

import { INNGEST_EVENT_KEY } from '$lib/server/env/inngest';
import { Logger } from '$lib/server/telemetry/logger';
import { version } from '$app/environment';

import { ApprovalEventData, ConfessionSubmitEventData } from './schema';

export const inngest = new Inngest({
  id: 'spectro',
  optimizeParallelism: true,
  checkpointing: true,
  appVersion: version,
  logger: Logger.byName('inngest'),
  eventKey: INNGEST_EVENT_KEY,
  schemas: new EventSchemas().fromSchema({
    'discord/confession.submit': ConfessionSubmitEventData,
    'discord/confession.approve': ApprovalEventData,
  }),
});
