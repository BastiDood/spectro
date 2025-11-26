import assert from 'node:assert/strict';
import process from 'node:process';

import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
  type LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { logs } from '@opentelemetry/api-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';

import { Logger } from '$lib/server/telemetry/logger';
import { OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_TOKEN } from '$lib/server/env/otel';
import { version } from '$app/environment';

// eslint-disable-next-line @typescript-eslint/init-declarations
let logRecordProcessor: LogRecordProcessor;
// eslint-disable-next-line @typescript-eslint/init-declarations
let spanProcessor: SpanProcessor;
if (typeof OTEL_EXPORTER_OTLP_ENDPOINT === 'undefined') {
  logRecordProcessor = new SimpleLogRecordProcessor(new ConsoleLogRecordExporter());
  spanProcessor = new BatchSpanProcessor(new ConsoleSpanExporter());
  // eslint-disable-next-line no-console
  console.warn('telemetry disabled due to missing OpenTelemetry environment variables');
} else {
  const headers: Record<string, string> = Object.create(null);
  if (typeof OTEL_EXPORTER_OTLP_TOKEN !== 'undefined')
    headers.Authorization = `Bearer ${OTEL_EXPORTER_OTLP_TOKEN}`;
  logRecordProcessor = new BatchLogRecordProcessor(
    new OTLPLogExporter({ url: OTEL_EXPORTER_OTLP_ENDPOINT, headers }),
  );
  spanProcessor = new BatchSpanProcessor(
    new OTLPTraceExporter({ url: OTEL_EXPORTER_OTLP_ENDPOINT, headers }),
  );
}

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: 'spectro',
  [ATTR_SERVICE_VERSION]: version,
});

const loggerProvider = new LoggerProvider({
  resource,
  processors: [logRecordProcessor],
});
logs.setGlobalLoggerProvider(loggerProvider);

const sdk = new NodeSDK({
  resource,
  spanProcessor,
  instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
});
sdk.start();

const logger = new Logger('shutdown');
process.once('sveltekit:shutdown', async reason => {
  logger.warn('graceful shutdown initiated', { 'shutdown.reason': reason });
  const [loggerProviderShutdown, sdkShutdown] = await Promise.allSettled([
    loggerProvider.shutdown(),
    sdk.shutdown(),
  ]);
  assert(loggerProviderShutdown.status === 'fulfilled');
  assert(sdkShutdown.status === 'fulfilled');
});
