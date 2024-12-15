import type { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import type { Message } from '$lib/server/models/discord/message';

export interface InteractionResponseMessage {
    type:
        | InteractionResponseType.ChannelMessageWithSource
        | InteractionResponseType.DeferredChannelMessageWithSource
        | InteractionResponseType.DeferredUpdateMessage
        | InteractionResponseType.UpdateMessage;
    data: Partial<Message>;
}
