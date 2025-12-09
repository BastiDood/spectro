import { Logger } from '$lib/server/telemetry/logger';

const SERVICE_NAME = 'lib.assert';
const logger = new Logger(SERVICE_NAME);

export class AssertionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assertDefined<T>(value?: T | undefined) {
  if (typeof value === 'undefined') {
    const error = new AssertionError('value must be defined');
    logger.error('value must be defined', error);
    throw error;
  }
  return value;
}

export function assertOptional<T>([value, ...values]: T[]) {
  if (values.length > 0) {
    const error = new AssertionError('expected at most one value');
    logger.error('expected at most one value', error, {
      'values.length': values.length,
    });
    throw error;
  }
  return value;
}

export function assertSingle<T>(values: T[]) {
  return assertDefined(assertOptional(values));
}
