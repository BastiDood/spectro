import type { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';
import type { Message } from '$lib/server/models/discord/message';

export interface InteractionCallbackMessage {
    type:
        | InteractionCallbackType.ChannelMessageWithSource
        | InteractionCallbackType.DeferredChannelMessageWithSource
        | InteractionCallbackType.DeferredUpdateMessage
        | InteractionCallbackType.UpdateMessage;
    data: Partial<Message>;
}
