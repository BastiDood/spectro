import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { registerOTel } from '@vercel/otel';

// OpenTelemetry SDK is configured via the standard environment variables at runtime.
registerOTel({
  serviceName: 'spectro',
  instrumentations: [new PgInstrumentation()],
  logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter())],
});
