import { check, type InferOutput, number, object, pipe, safeInteger, string } from 'valibot';

import { Logger } from '#lib/server/telemetry/logger/index.ts';

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

/** Narrows a raw Discord error code to a known {@linkcode DiscordErrorCode}, or `null` if Spectro does not handle it. */
export function parseDiscordErrorCode(code: number) {
  /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison -- Narrows raw codes into the enum. */
  switch (code) {
    case DiscordErrorCode.UnknownChannel:
    case DiscordErrorCode.UnknownWebhook:
    case DiscordErrorCode.MissingAccess:
    case DiscordErrorCode.MissingPermissions:
    case DiscordErrorCode.InvalidWebhookToken:
    case DiscordErrorCode.InvalidFormBody:
    case DiscordErrorCode.ThreadAlreadyCreatedForMessage:
    case DiscordErrorCode.ThreadLocked:
    case DiscordErrorCode.MaxActiveThreadsReached:
      return code;
    default:
      return null;
  }
  /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */
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
