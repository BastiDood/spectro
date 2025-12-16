import assert, { strictEqual } from 'node:assert/strict';

import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { ModalComponents } from '$lib/server/models/discord/message/component/modal';
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
  [labelComponent, ...otherComponents]: ModalComponents,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-confess-submit', async span => {
    span.setAttributes({ 'channel.id': channelId, 'author.id': authorId });

    strictEqual(otherComponents.length, 0);
    assert(typeof labelComponent !== 'undefined');
    strictEqual(labelComponent.type, MessageComponentType.Label);

    const { component } = labelComponent;
    strictEqual(component.type, MessageComponentType.TextInput);
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
