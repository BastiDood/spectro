interface SuccessfulResult<T> {
  ok: true;
  data: T;
}

interface FailedResult<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = SuccessfulResult<T> | FailedResult<E>;
