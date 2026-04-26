import { Logger } from '$lib/server/telemetry/logger';

const logger = Logger.byName('database.errors');

export class UnexpectedRowCountDatabaseError extends Error {
  constructor(public readonly count: number | null = null) {
    super(`unexpected row count ${count}`);
    this.name = 'UnexpectedRowCountError';
  }

  static throwNew(count?: number): never {
    const error = new UnexpectedRowCountDatabaseError(count);
    logger.fatal('unexpected row count', error, { 'error.count': count });
    throw error;
  }
}
