import { type InferOutput, literal, number, object, pipe, safeInteger, string } from 'valibot';

export const OAUTH_SCOPES = 'identify guilds';

export const TokenResponse = object({
    token_type: literal('Bearer'),
    expires_in: pipe(number(), safeInteger()),
    scope: literal(OAUTH_SCOPES),
    access_token: string(),
    refresh_token: string(),
});

export type TokenResponse = InferOutput<typeof TokenResponse>;
