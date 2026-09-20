import type { Exception } from '@opentelemetry/api';

export interface ErrorWithCode extends Error {
  code?: string | number | undefined;
}

function* traverseErrorCauseChain(error: Error) {
  const visitedErrors = new WeakSet<Error>([error]);

  let currentError = error;
  while (true) {
    yield currentError;

    if (!Error.isError(currentError.cause) || visitedErrors.has(currentError.cause)) break;
    visitedErrors.add(currentError);

    currentError = currentError.cause;
  }
}

export function serializeErrorToException(error: ErrorWithCode): Exception {
  const causeStack: string[] = [];

  for (const currentError of traverseErrorCauseChain(error).take(16))
    // Skip errors without a stack trace to minimize context noise
    if (typeof currentError.stack !== 'undefined') causeStack.push(currentError.stack);

  const { name, message, code } = error;
  const exception: Exception = { name, message, code };
  if (causeStack.length > 0) exception.stack = causeStack.join('\n\n');
  return exception;
}
