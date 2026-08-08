import type { Exception } from '@opentelemetry/api';

export interface ErrorWithCode extends Error {
  code?: string | number | undefined;
}

export function serializeErrorToException({
  name,
  message,
  code,
  stack,
  cause,
}: ErrorWithCode): Exception {
  // Keep track of the visited errors to avoid cyclical error chains
  const visitedErrors = new WeakSet<Error>();

  const causeStack: string[] = [];
  if (typeof stack !== 'undefined') causeStack.push(stack);

  // Maximum cause depth of 10 is sufficient for most use cases
  let currentCause = cause;
  for (let i = 0; i < 10; ++i) {
    // Avoid cyclical error chains
    if (!Error.isError(currentCause) || visitedErrors.has(currentCause)) break;
    visitedErrors.add(currentCause);

    // Skip errors without a stack trace to minimize context noise
    if (typeof currentCause.stack !== 'undefined') causeStack.push(currentCause.stack);

    // Traverse the cause chain forward
    currentCause = currentCause.cause;
  }

  const exception: Exception = { name, message, code };
  if (causeStack.length > 0) exception.stack = causeStack.join('\n\n');
  return exception;
}
