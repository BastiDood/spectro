import { Logger } from '$lib/server/telemetry/logger';

const logger = Logger.byName('database.errors');

export class UnexpectedRowCountDatabaseError extends Error {
  constructor(public readonly count?: number) {
    super(`Database mutation returned unexpected row count ${String(count)}.`);
    this.name = 'UnexpectedRowCountError';
  }

  static throwNew(count?: number): never {
    const error = new UnexpectedRowCountDatabaseError(count);
    if (typeof count === 'undefined')
      logger.error(error.message, 'spectro.database.row_count_unexpected', void 0, error);
    else
      logger.error(
        error.message,
        'spectro.database.row_count_unexpected',
        {
          'spectro.database.affected_row_count': count,
        },
        error,
      );
    throw error;
  }
}
