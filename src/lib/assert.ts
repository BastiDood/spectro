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
    logger.error('value must be defined');
    throw new AssertionError('value must be defined');
  }
  return value;
}

export function assertOptional<T>([value, ...values]: T[]) {
  if (values.length > 0) {
    logger.error('expected at most one value', void 0, {
      'values.length': values.length,
    });
    throw new AssertionError('expected at most one value');
  }
  return value;
}

export function assertSingle<T>(values: T[]) {
  return assertDefined(assertOptional(values));
}
