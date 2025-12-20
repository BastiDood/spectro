import { env } from '$env/dynamic/private';

export class UnknownDatabaseDriverError extends Error {
  constructor(public readonly driver: string) {
    super(`unknown database driver "${driver}"`);
    this.name = 'UnknownDatabaseDriverError';
  }
}

const databaseDriver = env.SPECTRO_DATABASE_DRIVER ?? 'pg';
switch (databaseDriver) {
  case 'pg':
  case 'neon':
    break;
  default:
    throw new UnknownDatabaseDriverError(databaseDriver);
}

export const SPECTRO_DATABASE_DRIVER = databaseDriver;
