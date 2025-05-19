import { type InferOutput, check, number, object, pipe, safeInteger, string } from 'valibot';

export const enum DiscordErrorCode {
  UnknownChannel = 10003,
  MissingAccess = 50001,
}

export const DiscordError = object({
  code: pipe(
    number(),
    safeInteger(),
    check(num => num >= 0),
  ),
  message: string(),
});

export type DiscordError = InferOutput<typeof DiscordError>;
