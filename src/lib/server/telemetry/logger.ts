import {
  type AnyValueMap,
  type Logger as OTelLogger,
  logs,
  SeverityNumber,
} from '@opentelemetry/api-logs';
import { context, type Exception, type Span, SpanStatusCode, trace } from '@opentelemetry/api';

/**
 * Traverses the full chain of error causes until a certain depth.
 * Sets the span status to `ERROR` at the end of the scope.
 */
function recordExceptionChain(span: Span, exception: Exception, depth = 10) {
  let error = exception;
  for (let i = 0; i < depth; ++i) {
    span.recordException(error);
    if (
      error instanceof Error &&
      typeof error.cause !== 'undefined' &&
      error.cause instanceof Error
    )
      error = error.cause;
    else break; // stop the error chain
  }
}

export class Logger {
  #logger: OTelLogger;

  constructor(name: string) {
    this.#logger = logs.getLogger(name);
  }

  trace(body: string, attributes?: AnyValueMap) {
    this.#logger.emit({
      severityNumber: SeverityNumber.TRACE,
      body,
      attributes,
    });
  }

  debug(body: string, attributes?: AnyValueMap) {
    this.#logger.emit({
      severityNumber: SeverityNumber.DEBUG,
      body,
      attributes,
    });
  }

  info(body: string, attributes?: AnyValueMap) {
    this.#logger.emit({
      severityNumber: SeverityNumber.INFO,
      body,
      attributes,
    });
  }

  warn(body: string, attributes?: AnyValueMap) {
    this.#logger.emit({
      severityNumber: SeverityNumber.WARN,
      body,
      attributes,
    });
  }

  /** Logs an error with an exception chain. */
  error(body: string, error?: Exception, attributes?: AnyValueMap) {
    const span = trace.getSpan(context.active());
    if (typeof span !== 'undefined' && typeof error !== 'undefined')
      recordExceptionChain(span, error);
    this.#logger.emit({ severityNumber: SeverityNumber.ERROR, body, attributes });
  }

  /** Same semantics as {@link error}, but sets the span status to {@link SpanStatusCode.ERROR}. */
  fatal(body: string, error?: Exception, attributes?: AnyValueMap) {
    const span = trace.getSpan(context.active());
    if (typeof span !== 'undefined') {
      if (typeof error !== 'undefined') recordExceptionChain(span, error);
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    this.#logger.emit({ severityNumber: SeverityNumber.FATAL, body, attributes });
  }
}
