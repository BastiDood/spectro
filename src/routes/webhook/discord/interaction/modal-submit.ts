import assert, { strictEqual } from 'node:assert/strict';

import type { InsertableAttachment } from '$lib/server/database';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import type { ModalComponents } from '$lib/server/models/discord/message/component/modal';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { ATTACH_FILES } from '$lib/server/models/discord/permission';
import type { Resolved } from '$lib/server/models/discord/resolved';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

import {
  submitConfession,
  ConfessError,
  InsufficientPermissionsConfessionError,
} from './confession.util';
import { hasAllPermissions } from './util';

const SERVICE_NAME = 'webhook.interaction.confess-submit';
const tracer = new Tracer(SERVICE_NAME);

export async function handleModalSubmit(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  channelId: Snowflake,
  authorId: Snowflake,
  permissions: bigint,
  [contentLabel, attachmentLabel, disclaimerDisplay, ...otherComponents]: ModalComponents,
  resolved: Resolved | undefined,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-confess-submit', async span => {
    span.setAttributes({ 'channel.id': channelId, 'author.id': authorId });

    strictEqual(otherComponents.length, 0);

    // Validate disclaimer TextDisplay (read-only, no action needed)
    assert(typeof disclaimerDisplay !== 'undefined');
    strictEqual(disclaimerDisplay.type, MessageComponentType.TextDisplay);

    // Parse content from text input
    assert(typeof contentLabel !== 'undefined');
    strictEqual(contentLabel.type, MessageComponentType.Label);

    const { component: contentComponent } = contentLabel;
    strictEqual(contentComponent.type, MessageComponentType.TextInput);
    assert(typeof contentComponent.value !== 'undefined');

    // Determine if this is a reply (custom_id is the parent message ID) or new confession
    const parentMessageId =
      contentComponent.custom_id === 'content' ? null : contentComponent.custom_id;

    // Parse optional attachment from file upload
    assert(typeof attachmentLabel !== 'undefined');
    strictEqual(attachmentLabel.type, MessageComponentType.Label);

    const { component: attachmentComponent } = attachmentLabel;
    strictEqual(attachmentComponent.type, MessageComponentType.FileUpload);
    strictEqual(attachmentComponent.custom_id, 'attachment');

    const [attachmentId, ...otherAttachments] = attachmentComponent.values ?? [];
    strictEqual(otherAttachments.length, 0);

    let attachment: InsertableAttachment | null = null;
    if (typeof attachmentId !== 'undefined') {
      assert(typeof resolved?.attachments !== 'undefined');
      const attachmentData = resolved.attachments[attachmentId];
      assert(typeof attachmentData !== 'undefined');

      // Lazy permission check: only validate `ATTACH_FILES` when attachment is present
      if (!hasAllPermissions(permissions, ATTACH_FILES))
        InsufficientPermissionsConfessionError.throwNew(permissions);

      attachment = {
        id: attachmentData.id,
        filename: attachmentData.filename,
        content_type: attachmentData.content_type,
        url: attachmentData.url,
        proxy_url: attachmentData.proxy_url,
      };
    }

    try {
      await submitConfession(
        timestamp,
        applicationId,
        interactionToken,
        permissions,
        channelId,
        authorId,
        contentComponent.value,
        attachment,
        parentMessageId,
      );
    } catch (error) {
      if (error instanceof ConfessError)
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral, content: error.message },
        };
      throw error;
    }

    return {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    };
  });
}
