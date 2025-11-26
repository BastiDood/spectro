import process from 'node:process';

import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  SimpleLogRecordProcessor,
  type LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';

import {
  OTEL_EXPORTER_OTLP_BASIC,
  OTEL_EXPORTER_OTLP_BEARER,
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
} from '$lib/server/env/otel';
import { version } from '$app/environment';

// eslint-disable-next-line @typescript-eslint/init-declarations
let logRecordProcessor: LogRecordProcessor;
// eslint-disable-next-line @typescript-eslint/init-declarations
let spanProcessor: SpanProcessor;
if (
  typeof OTEL_EXPORTER_OTLP_LOGS_ENDPOINT === 'undefined' ||
  typeof OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === 'undefined'
) {
  // eslint-disable-next-line no-console
  console.warn('telemetry disabled due to missing OpenTelemetry environment variables');
  logRecordProcessor = new SimpleLogRecordProcessor(new ConsoleLogRecordExporter());
  spanProcessor = new BatchSpanProcessor(new ConsoleSpanExporter());
} else {
  const headers: Record<string, string> = Object.create(null);
  if (typeof OTEL_EXPORTER_OTLP_BEARER !== 'undefined')
    headers.Authorization = `Bearer ${OTEL_EXPORTER_OTLP_BEARER}`;
  else if (typeof OTEL_EXPORTER_OTLP_BASIC !== 'undefined')
    headers.Authorization = `Basic ${OTEL_EXPORTER_OTLP_BASIC}`;
  logRecordProcessor = new BatchLogRecordProcessor(
    new OTLPLogExporter({ url: OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, headers }),
  );
  spanProcessor = new BatchSpanProcessor(
    new OTLPTraceExporter({ url: OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, headers }),
  );
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'spectro',
    [ATTR_SERVICE_VERSION]: version,
  }),
  spanProcessors: [spanProcessor],
  logRecordProcessors: [logRecordProcessor],
  instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
});
sdk.start();

process.once('sveltekit:shutdown', async reason => {
  // eslint-disable-next-line no-console
  console.warn('graceful shutdown...', reason);
  await sdk.shutdown();
});
