import { AssertionError } from 'node:assert/strict';

import { context, type Exception, type Span, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  type AnyValueMap,
  type Logger as OTelLogger,
  logs,
  SeverityNumber,
} from '@opentelemetry/api-logs';
import { getDotPath, isValiError } from 'valibot';

/**
 * Traverses the full chain of error causes until a certain depth.
 * Sets the span status to `ERROR` at the end of the scope.
 */
function recordExceptionChain(span: Span, exception: Exception, depth = 10) {
  for (let i = 0; i < depth; ++i) {
    span.recordException(exception);

    if (isValiError(exception)) {
      const paths = exception.issues.map(issue => getDotPath(issue)).filter(path => path !== null);
      span.setAttribute('error.valibot.paths', paths);
    } else if (exception instanceof AssertionError) {
      span.setAttributes({
        'error.assertion.actual': String(exception.actual),
        'error.assertion.expected': String(exception.expected),
      });
    }

    if (
      exception instanceof Error &&
      typeof exception.cause !== 'undefined' &&
      exception.cause instanceof Error
    )
      // eslint-disable-next-line no-param-reassign
      exception = exception.cause;
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
