import type { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';
import type { MessageComponentTextInput } from '$lib/server/models/discord/message/component/text-input';

export interface InteractionCallbackModal {
    type: InteractionCallbackType.Modal;
    custom_id: string;
    title: string;
    components: MessageComponentTextInput[];
}
