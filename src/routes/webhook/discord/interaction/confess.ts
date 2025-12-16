import { strictEqual } from 'node:assert/strict';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import type { Attachment } from '$lib/server/models/discord/attachment';
import { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Resolved } from '$lib/server/models/discord/resolved';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

import * as schema from '$lib/server/database/models';
import { db } from '$lib/server/database';

import { ConfessError, submitConfession } from './confession.util';

const SERVICE_NAME = 'webhook.interaction.confess';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export async function handleConfess(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  permissions: bigint,
  channelId: Snowflake,
  authorId: Snowflake,
  options: InteractionApplicationCommandChatInputOption[],
  resolved: Resolved | null,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-confess', async span => {
    span.setAttributes({ 'channel.id': channelId, 'author.id': authorId });

    // eslint-disable-next-line @typescript-eslint/init-declarations
    let content: string | undefined;
    let attachment: Attachment | null = null;
    for (const option of options)
      switch (option.name) {
        case 'content':
          strictEqual(option.type, InteractionApplicationCommandChatInputOptionType.String);
          content = option.value;
          break;
        case 'attachment':
          strictEqual(option.type, InteractionApplicationCommandChatInputOptionType.Attachment);
          attachment = resolved?.attachments?.[option.value] ?? null;
          break;
        default:
          logger.warn('unexpected option', {
            'option.type': option.type,
            'option.name': option.name,
          });
          break;
      }

    // If no content provided, show modal
    if (typeof content === 'undefined') {
      // Store attachment in database if provided, then encode ID in custom_id
      let attachmentCustomId = 'content|';
      if (attachment !== null) {
        attachmentCustomId += attachment.id;
        await db.insert(schema.attachment).values({
          id: BigInt(attachment.id),
          filename: attachment.filename,
          contentType: attachment.content_type,
          url: attachment.url,
          proxyUrl: attachment.proxy_url,
        });
      }
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
                  custom_id: attachmentCustomId,
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
    }

    try {
      await submitConfession(
        timestamp,
        applicationId,
        interactionToken,
        permissions,
        channelId,
        authorId,
        content,
        attachment,
        true,
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
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    };
  });
}
