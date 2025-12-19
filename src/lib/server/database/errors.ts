import { Logger } from '$lib/server/telemetry/logger';

const logger = new Logger('database.errors');

export class UnknownDatabaseDriverError extends Error {
  constructor(public readonly driver: string) {
    super(`unknown database driver "${driver}"`);
    this.name = 'UnknownDatabaseDriverError';
  }

  static throwNew(driver: string): never {
    const error = new UnknownDatabaseDriverError(driver);
    logger.error('unknown database driver', error, { driver });
    throw error;
  }
}

export abstract class DatabaseError extends Error {}

export class UnexpectedRowCountDatabaseError extends DatabaseError {
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
