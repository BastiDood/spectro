import { describe, expect, it } from 'vitest';

import { serializeErrorToException } from './exception.ts';

class CharacterizedError extends Error {
  readonly requestId = 'request-1';
  readonly retryable = true;
  code?: string | number;

  constructor(name: string, message: string, stack?: string, cause?: Error) {
    super(message, { cause });
    this.name = name;
    this.stack = stack;
  }
}

describe('serializeErrorToException', () => {
  it('serializes the outer identity and excludes unrelated error fields', () => {
    const error = new CharacterizedError('DiscordApiError', 'Discord rejected the request');

    expect(serializeErrorToException(error)).toStrictEqual({
      name: 'DiscordApiError',
      message: 'Discord rejected the request',
      code: void 0,
    });
  });

  it.each([50035, 'INVALID_FORM_BODY'])('preserves the outer code %s', code => {
    const error = new CharacterizedError('DiscordApiError', 'Request failed');
    error.code = code;

    expect(serializeErrorToException(error)).toMatchObject({ code });
  });

  it('omits stack when no error has a defined stack', () => {
    const cause = new CharacterizedError('CauseError', 'Cause failed');
    const error = new CharacterizedError('RequestError', 'Request failed', void 0, cause);

    expect(serializeErrorToException(error)).not.toHaveProperty('stack');
  });

  it('preserves an empty outer stack', () => {
    const error = new CharacterizedError('RequestError', 'Request failed', '');

    expect(serializeErrorToException(error)).toHaveProperty('stack', '');
  });

  it('joins cause stacks in outer-to-inner order with blank lines', () => {
    const rootCause = new CharacterizedError('NetworkError', 'Network failed', 'root stack');
    const cause = new CharacterizedError('ApiError', 'API failed', 'cause stack', rootCause);
    const error = new CharacterizedError('RequestError', 'Request failed', 'outer stack', cause);

    expect(serializeErrorToException(error)).toHaveProperty(
      'stack',
      'outer stack\n\ncause stack\n\nroot stack',
    );
  });

  it('continues through a stackless cause', () => {
    const rootCause = new CharacterizedError('NetworkError', 'Network failed', 'root stack');
    const cause = new CharacterizedError('ApiError', 'API failed', void 0, rootCause);
    const error = new CharacterizedError('RequestError', 'Request failed', 'outer stack', cause);

    expect(serializeErrorToException(error)).toHaveProperty('stack', 'outer stack\n\nroot stack');
  });

  it('stops at a non-Error cause', () => {
    const error = new CharacterizedError('RequestError', 'Request failed', 'outer stack');
    error.cause = { message: 'not an Error' };

    expect(serializeErrorToException(error)).toHaveProperty('stack', 'outer stack');
  });

  it('does not repeat a self-referential cause', () => {
    const error = new CharacterizedError('RequestError', 'Request failed', 'outer stack');
    error.cause = error;

    expect(serializeErrorToException(error)).toHaveProperty('stack', 'outer stack');
  });

  it('stops at a repeated error in a longer cycle', () => {
    const first = new CharacterizedError('FirstError', 'First failed', 'first stack');
    const second = new CharacterizedError('SecondError', 'Second failed', 'second stack', first);
    first.cause = second;
    const error = new CharacterizedError('OuterError', 'Outer failed', 'outer stack', first);

    expect(serializeErrorToException(error)).toHaveProperty(
      'stack',
      'outer stack\n\nfirst stack\n\nsecond stack',
    );
  });

  it('includes the outer error and 15 causes and omits the 16th', () => {
    let cause = new CharacterizedError('Cause17', 'Cause 17 failed', 'cause 17 stack');
    for (let index = 16; index > 0; --index)
      cause = new CharacterizedError(
        `Cause${index}`,
        `Cause ${index} failed`,
        `cause ${index} stack`,
        cause,
      );

    const error = new CharacterizedError('OuterError', 'Outer failed', 'outer stack', cause);
    const { stack } = serializeErrorToException(error);

    expect(stack).toContain('cause 15 stack');
    expect(stack).not.toContain('cause 16 stack');
    expect(stack?.match(/\n\n/gu)).toHaveLength(15);
  });

  it('preserves only the outer code', () => {
    const cause = new CharacterizedError('CauseError', 'Cause failed', 'cause stack');
    cause.code = 'CAUSE_CODE';
    const error = new CharacterizedError('OuterError', 'Outer failed', 'outer stack', cause);
    error.code = 'OUTER_CODE';

    expect(serializeErrorToException(error)).toHaveProperty('code', 'OUTER_CODE');
  });

  it('does not mutate the error chain', () => {
    const cause = new CharacterizedError('CauseError', 'Cause failed', 'cause stack');
    const error = new CharacterizedError('OuterError', 'Outer failed', 'outer stack', cause);

    serializeErrorToException(error);

    expect(error.cause).toBe(cause);
    expect(cause.cause).toBeUndefined();
    expect(error.stack).toBe('outer stack');
    expect(cause.stack).toBe('cause stack');
  });
});
