export { SPECTRO_DATABASE_DRIVER } from '$env/static/private';

export class UnknownDatabaseDriverError extends Error {
  constructor(public readonly driver: string) {
    super(`unknown database driver "${driver}"`);
    this.name = 'UnknownDatabaseDriverError';
  }
}
