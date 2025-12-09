import process from 'node:process';

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

// OpenTelemetry SDK is configured via the standard environment variables at runtime.
const sdk = new NodeSDK({ instrumentations: [new HttpInstrumentation(), new PgInstrumentation()] });
sdk.start();

process.once('sveltekit:shutdown', async reason => {
  // eslint-disable-next-line no-console
  console.warn('graceful shutdown...', reason);
  await sdk.shutdown();
});
