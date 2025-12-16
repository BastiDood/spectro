import assert, { strictEqual } from 'node:assert/strict';

import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { MessageComponents } from '$lib/server/models/discord/message/component';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

import { submitConfession, ConfessError } from './confession.util';

const SERVICE_NAME = 'webhook.interaction.confess-submit';
const tracer = new Tracer(SERVICE_NAME);

export async function handleConfessSubmit(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  channelId: Snowflake,
  authorId: Snowflake,
  permissions: bigint,
  [row, ...otherRows]: MessageComponents,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-confess-submit', async span => {
    span.setAttributes({ 'channel.id': channelId, 'author.id': authorId });

    strictEqual(otherRows.length, 0);
    assert(typeof row !== 'undefined');

    const [component, ...otherComponents] = row.components;
    strictEqual(otherComponents.length, 0);
    assert(typeof component !== 'undefined');

    strictEqual(component?.type, MessageComponentType.TextInput);
    assert(typeof component.value !== 'undefined');
    strictEqual(component.custom_id, 'content');

    // TODO: When modal file input is implemented, fetch the attachment from the `attachment` table here.
    try {
      await submitConfession(
        timestamp,
        applicationId,
        interactionToken,
        permissions,
        channelId,
        authorId,
        component.value,
        null,
      );
    } catch (err) {
      if (err instanceof ConfessError)
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral, content: err.message },
        };
      throw err;
    }

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral, content: 'Submitting confession...' },
    };
  });
}
