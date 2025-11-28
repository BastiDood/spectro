import { type Tracer as OTelTracer, type Span, trace } from '@opentelemetry/api';

import { Logger } from './logger';

export class Tracer {
  static #LOGGER = new Logger('tracer');

  #tracer: OTelTracer;

  constructor(name: string) {
    this.#tracer = trace.getTracer(name);
  }

  span<T>(name: string, fn: (span: Span) => T) {
    return this.#tracer.startActiveSpan(name, span => {
      try {
        return fn(span);
      } catch (err) {
        if (err instanceof Error) Tracer.#LOGGER.fatal('unhandled error', err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  async asyncSpan<T>(name: string, fn: (span: Span) => Promise<T>) {
    return await this.#tracer.startActiveSpan(name, async span => {
      try {
        return await fn(span);
      } catch (err) {
        if (err instanceof Error) Tracer.#LOGGER.fatal('unhandled error', err);
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
