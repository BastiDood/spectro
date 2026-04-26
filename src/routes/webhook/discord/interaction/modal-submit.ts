import assert, { strictEqual } from 'node:assert/strict';

import { assertOptional } from '$lib/assert';
import { hasAllFlags } from '$lib/bits';
import { inngest } from '$lib/server/inngest/client';
import { ConfessionSubmitEvent } from '$lib/server/inngest/functions/process-confession-submission/schema';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { ModalComponents } from '$lib/server/models/discord/message/component/modal';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { ATTACH_FILES, SEND_MESSAGES } from '$lib/server/models/discord/permission';
import type { Resolved } from '$lib/server/models/discord/resolved';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'webhook.interaction.confess-submit';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export async function handleModalSubmit(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
  channelId: Snowflake,
  authorId: Snowflake,
  permissions: bigint,
  [contentLabel, attachmentLabel, disclaimerDisplay, ...otherComponents]: ModalComponents,
  resolved: Resolved | undefined,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-confess-submit', async span => {
    span.setAttributes({ 'channel.id': channelId, 'author.id': authorId });

    strictEqual(otherComponents.length, 0);

    assert(typeof disclaimerDisplay !== 'undefined');
    strictEqual(disclaimerDisplay.type, MessageComponentType.TextDisplay);

    assert(typeof contentLabel !== 'undefined');
    strictEqual(contentLabel.type, MessageComponentType.Label);

    const { component: contentComponent } = contentLabel;
    strictEqual(contentComponent.type, MessageComponentType.TextInput);
    assert(typeof contentComponent.value !== 'undefined');

    const parentMessageId =
      contentComponent.custom_id === 'content' ? null : contentComponent.custom_id;

    assert(typeof attachmentLabel !== 'undefined');
    strictEqual(attachmentLabel.type, MessageComponentType.Label);

    const { component: attachmentComponent } = attachmentLabel;
    strictEqual(attachmentComponent.type, MessageComponentType.FileUpload);
    strictEqual(attachmentComponent.custom_id, 'attachment');

    assert(hasAllFlags(permissions, SEND_MESSAGES));

    const attachmentId = assertOptional(attachmentComponent.values ?? []);
    let attachment = null;
    if (typeof attachmentId !== 'undefined') {
      assert(hasAllFlags(permissions, ATTACH_FILES));
      assert(typeof resolved?.attachments !== 'undefined');
      const attachmentData = resolved.attachments[attachmentId];
      assert(typeof attachmentData !== 'undefined');

      attachment = {
        id: attachmentData.id,
        filename: attachmentData.filename,
        contentType: attachmentData.content_type ?? null,
        url: attachmentData.url,
        proxyUrl: attachmentData.proxy_url,
      };
    }

    const { ids } = await inngest.send(
      ConfessionSubmitEvent.create(
        {
          applicationId,
          interactionId,
          interactionToken,
          channelId,
          authorId,
          content: contentComponent.value,
          parentMessageId,
          attachment,
        },
        { id: interactionId, ts: timestamp.valueOf() },
      ),
    );
    logger.debug('confession submission queued', { 'inngest.events.id': ids });

    return {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    };
  });
}
