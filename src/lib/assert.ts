export class AssertionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assertDefined<T>(value?: T | undefined) {
  if (typeof value === 'undefined') throw new AssertionError('value must be defined');
  return value;
}

export function assertOptional<T>([value, ...values]: T[]) {
  if (values.length > 0) throw new AssertionError('expected at most one value');
  return value;
}

export function assertSingle<T>(values: T[]) {
  return assertDefined(assertOptional(values));
}
