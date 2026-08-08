import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  type Span,
  type SpanStatus,
  SpanStatusCode,
  type Tracer as OTelTracer,
  trace,
} from '@opentelemetry/api';

import { version } from '$app/environment';

export class Tracer {
  #tracer: OTelTracer;

  constructor(tracer: OTelTracer) {
    this.#tracer = tracer;
  }

  static byName(name: string) {
    return new Tracer(trace.getTracer(name, version));
  }

  static #recordErrorSpan(span: Span, error: unknown) {
    const spanStatus: SpanStatus = { code: SpanStatusCode.ERROR };
    if (Error.isError(error)) {
      span.setAttribute(ATTR_ERROR_TYPE, error.name);
      spanStatus.message = error.message;
    }
    span.setStatus(spanStatus);
  }

  span<T>(name: string, fn: (span: Span) => T) {
    return this.#tracer.startActiveSpan(name, span => {
      try {
        const result = fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        Tracer.#recordErrorSpan(span, error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async asyncSpan<T>(name: string, fn: (span: Span) => Promise<T>) {
    return await this.#tracer.startActiveSpan(name, async span => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        Tracer.#recordErrorSpan(span, error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
