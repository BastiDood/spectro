import { check, type InferOutput, number, object, pipe, safeInteger, string } from 'valibot';

import { Logger } from '$lib/server/telemetry/logger';

const SERVICE_NAME = 'models.discord.errors';
const logger = Logger.byName(SERVICE_NAME);

export const enum DiscordErrorCode {
  UnknownChannel = 10003,
  UnknownWebhook = 10015,
  MissingAccess = 50001,
  MissingPermissions = 50013,
  InvalidWebhookToken = 50027,
  InvalidFormBody = 50035,
  ThreadAlreadyCreatedForMessage = 160004,
  ThreadLocked = 160005,
  MaxActiveThreadsReached = 160006,
}

export const DiscordErrorResponse = object({
  code: pipe(
    number(),
    safeInteger(),
    check(num => num >= 0),
  ),
  message: string(),
});

export type DiscordErrorResponse = InferOutput<typeof DiscordErrorResponse>;

export class DiscordError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(`Discord returned error code ${code}: ${message}`);
    this.name = 'DiscordError';
  }

  static throwNew(code: number, message: string): never {
    const error = new DiscordError(code, message);
    logger.error(
      `Discord returned error code ${error.code}.`,
      'spectro.discord.api.response_rejected',
      { 'spectro.discord.error.code': error.code },
      error,
    );
    throw error;
  }
}
