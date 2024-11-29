import { type InferOutput, array, literal, object, variant } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

import { MessageComponentTextInput } from '$lib/server/models/discord/message/component/text-input';

const MessageComponentInnerComponent = variant('type', [MessageComponentTextInput]);

export const MessageComponentActionRow = object({
    type: literal(MessageComponentType.ActionRow),
    components: array(MessageComponentInnerComponent),
});

export type MessageComponentActionRow = InferOutput<typeof MessageComponentActionRow>;
