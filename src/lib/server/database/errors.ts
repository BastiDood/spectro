import { Logger } from '$lib/server/telemetry/logger';

const logger = Logger.byName('database.errors');

export class UnexpectedRowCountDatabaseError extends Error {
  constructor(public readonly count: number | null = null) {
    super(`unexpected row count ${count}`);
    this.name = 'UnexpectedRowCountError';
  }

  static throwNew(count?: number): never {
    const error = new UnexpectedRowCountDatabaseError(count);
    logger.error('unexpected row count', error, { count });
    throw error;
  }
}
