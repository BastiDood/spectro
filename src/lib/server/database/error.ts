export class UnknownDatabaseDriverError extends Error {
  constructor(public readonly driver: string) {
    super(`unknown database driver "${driver}"`);
    this.name = 'UnknownDatabaseDriverError';
  }
}

export class DatabaseError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class MissingRowCountDatabaseError extends Error {
  constructor() {
    super('missing row count');
    this.name = 'MissingRowCountDatabaseError';
  }
}

export class UnexpectedRowCountDatabaseError extends Error {
  constructor(public count: number) {
    super(`unexpected row count ${count}`);
    this.name = 'UnexpectedRowCountDatabaseError';
  }
}
