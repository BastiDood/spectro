import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { registerOTel } from '@vercel/otel';

// OpenTelemetry SDK is configured via the standard environment variables at runtime.
registerOTel({
  serviceName: 'spectro',
  autoDetectResources: false,
  instrumentations: [new PgInstrumentation()],
});
