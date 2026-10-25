import type { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.ts';

export interface InteractionResponsePing {
  type: InteractionResponseType.Pong;
}
