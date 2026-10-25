import type { CreateMessage } from '#lib/server/models/discord/message/index.js';
import type { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.js';

export interface InteractionResponseMessage {
  type:
    | InteractionResponseType.ChannelMessageWithSource
    | InteractionResponseType.DeferredChannelMessageWithSource
    | InteractionResponseType.DeferredUpdateMessage
    | InteractionResponseType.UpdateMessage;
  data?: Partial<CreateMessage>;
}
