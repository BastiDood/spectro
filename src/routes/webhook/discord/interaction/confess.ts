import { Tracer } from '$lib/server/telemetry/tracer';

import type { Snowflake } from '$lib/server/models/discord/snowflake';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

const SERVICE_NAME = 'webhook.interaction.confess';
const tracer = new Tracer(SERVICE_NAME);

export function handleConfess(channelId: Snowflake, authorId: Snowflake): InteractionResponse {
  return tracer.span('handle-confess', span => {
    span.setAttributes({ 'channel.id': channelId, 'author.id': authorId });
    return {
      type: InteractionResponseType.Modal,
      data: {
        custom_id: 'confess',
        title: 'Submit Confession',
        components: [
          {
            type: MessageComponentType.ActionRow,
            components: [
              {
                custom_id: 'content',
                type: MessageComponentType.TextInput,
                style: MessageComponentTextInputStyle.Long,
                required: true,
                label: 'Confession',
                placeholder: 'Your message...',
              },
            ],
          },
        ],
      },
    };
  });
}
