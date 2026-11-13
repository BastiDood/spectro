import {
  type AnyValueMap,
  type Logger as OTelLogger,
  type LogRecord,
  logs,
  SeverityNumber,
} from '@opentelemetry/api-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';

import { version } from '$app/env';

import { serializeErrorToException } from './exception.ts';

export class Logger {
  #logger: OTelLogger;

  constructor(logger: OTelLogger) {
    this.#logger = logger;
  }

  static byName(name: string) {
    return new Logger(logs.getLogger(name, version));
  }

  static #createLogRecord(
    severityNumber: SeverityNumber,
    body: string,
    eventName: string,
    attributes?: AnyValueMap,
    error?: Error,
  ) {
    const logRecord: LogRecord = {
      severityNumber,
      severityText: SeverityNumber[severityNumber],
      body,
      eventName,
      attributes,
    };
    if (typeof error !== 'undefined') {
      // The logger bundled by @vercel/otel reads exception attributes directly.
      const { name, message, stack } = serializeErrorToException(error);
      logRecord.attributes = {
        ...attributes,
        [ATTR_EXCEPTION_TYPE]: name,
        [ATTR_EXCEPTION_MESSAGE]: message,
      };
      if (typeof stack !== 'undefined') logRecord.attributes[ATTR_EXCEPTION_STACKTRACE] = stack;
    }
    return logRecord;
  }

  trace(body: string, eventName: string, attributes?: AnyValueMap, error?: Error) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.TRACE, body, eventName, attributes, error),
    );
  }

  debug(body: string, eventName: string, attributes?: AnyValueMap, error?: Error) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.DEBUG, body, eventName, attributes, error),
    );
  }

  info(body: string, eventName: string, attributes?: AnyValueMap, error?: Error) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.INFO, body, eventName, attributes, error),
    );
  }

  warn(body: string, eventName: string, attributes?: AnyValueMap, error?: Error) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.WARN, body, eventName, attributes, error),
    );
  }

  error(body: string, eventName: string, attributes?: AnyValueMap, error?: Error) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.ERROR, body, eventName, attributes, error),
    );
  }

  fatal(body: string, eventName: string, attributes?: AnyValueMap, error?: Error) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.FATAL, body, eventName, attributes, error),
    );
  }
}
