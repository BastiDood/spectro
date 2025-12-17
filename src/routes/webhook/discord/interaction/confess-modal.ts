import { Tracer } from '$lib/server/telemetry/tracer';

import { createConfessionModal } from '$lib/server/confession';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

const SERVICE_NAME = 'webhook.interaction.confess';
const tracer = new Tracer(SERVICE_NAME);

export function handleConfess(channelId: Snowflake, authorId: Snowflake): InteractionResponse {
  return tracer.span('handle-confess', span => {
    span.setAttributes({ 'channel.id': channelId, 'author.id': authorId });
    return createConfessionModal(null);
  });
}
