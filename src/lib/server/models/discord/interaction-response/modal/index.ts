import type { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import type { MessageComponentActionRow } from '$lib/server/models/discord/message/component/action-row';

export interface InteractionResponseModal {
  type: InteractionResponseType.Modal;
  data: {
    custom_id: string;
    title: string;
    components: MessageComponentActionRow[];
  };
}
