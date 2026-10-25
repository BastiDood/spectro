import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { inngest } from '#lib/server/inngest/client/index.ts';
import { InngestSpanProcessor } from 'inngest/experimental';
import { type InstrumentationOptionOrName, registerOTel } from '@vercel/otel';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

import { SPECTRO_DATABASE_DRIVER } from '$app/env/private';

const instrumentations: InstrumentationOptionOrName[] = [];
if (SPECTRO_DATABASE_DRIVER === 'pg') {
  const { PgInstrumentation } = await import('@opentelemetry/instrumentation-pg');
  instrumentations.push(new PgInstrumentation());
}

registerOTel({
  serviceName: 'spectro',
  instrumentations,
  spanProcessors: [
    new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }),
    new InngestSpanProcessor(inngest),
  ],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
});
