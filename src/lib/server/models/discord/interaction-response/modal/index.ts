import type { CreateModalComponents } from '$lib/server/models/discord/message/component/modal';
import type { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';

export interface InteractionResponseModal {
  type: InteractionResponseType.Modal;
  data: {
    custom_id: string;
    title: string;
    components: CreateModalComponents;
  };
}
