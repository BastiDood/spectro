import {
  type AnyValueMap,
  type Logger as OTelLogger,
  type LogRecord,
  logs,
  SeverityNumber,
} from '@opentelemetry/api-logs';

import { version } from '$app/environment';

import { serializeErrorToException } from './exception';

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
    attributes?: AnyValueMap | undefined,
    error?: Error | undefined,
  ) {
    const logRecord: LogRecord = {
      severityNumber,
      body,
      eventName,
      attributes,
    };
    if (typeof error !== 'undefined') logRecord.exception = serializeErrorToException(error);
    return logRecord;
  }

  trace(
    body: string,
    eventName: string,
    attributes?: AnyValueMap | undefined,
    error?: Error | undefined,
  ) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.TRACE, body, eventName, attributes, error),
    );
  }

  debug(
    body: string,
    eventName: string,
    attributes?: AnyValueMap | undefined,
    error?: Error | undefined,
  ) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.DEBUG, body, eventName, attributes, error),
    );
  }

  info(
    body: string,
    eventName: string,
    attributes?: AnyValueMap | undefined,
    error?: Error | undefined,
  ) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.INFO, body, eventName, attributes, error),
    );
  }

  warn(
    body: string,
    eventName: string,
    attributes?: AnyValueMap | undefined,
    error?: Error | undefined,
  ) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.WARN, body, eventName, attributes, error),
    );
  }

  error(
    body: string,
    eventName: string,
    attributes?: AnyValueMap | undefined,
    error?: Error | undefined,
  ) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.ERROR, body, eventName, attributes, error),
    );
  }

  fatal(
    body: string,
    eventName: string,
    attributes?: AnyValueMap | undefined,
    error?: Error | undefined,
  ) {
    this.#logger.emit(
      Logger.#createLogRecord(SeverityNumber.FATAL, body, eventName, attributes, error),
    );
  }
}
