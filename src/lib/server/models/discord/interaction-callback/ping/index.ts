import type { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';

export interface InteractionCallbackPing {
    type: InteractionCallbackType.Pong;
}
