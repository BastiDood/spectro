import type { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.js';

export interface InteractionResponsePing {
  type: InteractionResponseType.Pong;
}
