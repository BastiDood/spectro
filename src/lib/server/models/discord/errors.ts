import { type InferOutput, check, number, object, pipe, safeInteger, string } from 'valibot';

export const enum DiscordErrorCode {
  UnknownChannel = 10003,
  MissingAccess = 50001,
  MissingPermissions = 50013,
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
    super(message);
    this.name = 'DiscordError';
  }
}
