import type { CreateModalComponents } from '#lib/server/models/discord/message/component/modal/index.ts';
import type { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.ts';

export interface InteractionResponseModal {
  type: InteractionResponseType.Modal;
  data: {
    custom_id: string;
    title: string;
    components: CreateModalComponents;
  };
}
