import type { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';

export interface InteractionResponsePing {
    type: InteractionResponseType.Pong;
}
