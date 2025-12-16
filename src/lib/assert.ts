import { Logger } from '$lib/server/telemetry/logger';

const SERVICE_NAME = 'lib.assert';
const logger = new Logger(SERVICE_NAME);

export class UnreachableCodeError extends Error {
  constructor() {
    super('unreachable code');
    this.name = 'UnreachableCodeError';
  }

  static throwNew(): never {
    const error = new UnreachableCodeError();
    logger.error(error.message, error);
    throw error;
  }
}

export class AssertionError extends Error {
  constructor(message = 'assertion failed') {
    super(message);
    this.name = 'AssertionError';
  }

  static throwNew(message?: string): never {
    const error = new AssertionError(message);
    logger.error(error.message, error);
    throw error;
  }
}

/** @throws {AssertionError} */
export function assertDefined<T>(value?: T | undefined) {
  if (typeof value === 'undefined') AssertionError.throwNew('value must be defined');
  return value;
}

/** @throws {AssertionError} */
export function assertOptional<T>([value, ...values]: T[]) {
  if (values.length > 0) AssertionError.throwNew('expected at most one value');
  return value;
}

/** @throws {AssertionError} */
export function assertSingle<T>(values: T[]) {
  return assertDefined(assertOptional(values));
}
