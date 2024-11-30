import type { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';
import type { MessageComponentActionRow } from '$lib/server/models/discord/message/component/action-row';

export interface InteractionCallbackModal {
    type: InteractionCallbackType.Modal;
    custom_id: string;
    title: string;
    components: MessageComponentActionRow[];
}
