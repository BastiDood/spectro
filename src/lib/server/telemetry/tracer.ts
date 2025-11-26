import { type Tracer as OTelTracer, type Span, trace } from '@opentelemetry/api';

export class Tracer {
  #tracer: OTelTracer;

  constructor(name: string) {
    this.#tracer = trace.getTracer(name);
  }

  span<T>(name: string, fn: (span: Span) => T) {
    return this.#tracer.startActiveSpan(name, span => {
      try {
        return fn(span);
      } finally {
        span.end();
      }
    });
  }

  async asyncSpan<T>(name: string, fn: (span: Span) => Promise<T>) {
    return await this.#tracer.startActiveSpan(name, async span => {
      try {
        return await fn(span);
      } finally {
        span.end();
      }
    });
  }
}
