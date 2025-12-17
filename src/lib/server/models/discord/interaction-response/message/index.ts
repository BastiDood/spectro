import type { CreateMessage } from '$lib/server/models/discord/message';
import type { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';

export interface InteractionResponseMessage {
  type:
    | InteractionResponseType.ChannelMessageWithSource
    | InteractionResponseType.DeferredChannelMessageWithSource
    | InteractionResponseType.DeferredUpdateMessage
    | InteractionResponseType.UpdateMessage;
  data: Partial<CreateMessage>;
}
