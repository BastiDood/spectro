import assert, { strictEqual } from 'node:assert/strict';

import type { Logger } from 'pino';

import type { Attachment } from '$lib/server/models/discord/attachment';
import { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Resolved } from '$lib/server/models/discord/resolved';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import type { InteractionResponseModal } from '$lib/server/models/discord/interaction-response/modal';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageComponentTextInputStyle } from '$lib/server/models/discord/message/component/text-input';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';

import * as schema from '$lib/server/database/models';
import { db } from '$lib/server/database';

import { ConfessError, submitConfession } from './confession.util';

export async function handleConfess(
  logger: Logger,
  timestamp: Date,
  permissions: bigint,
  channelId: Snowflake,
  authorId: Snowflake,
  options: InteractionApplicationCommandChatInputOption[],
  resolved: Resolved | null,
): Promise<InteractionResponse> {
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
        attachment = resolved?.attachments?.[option.value.toString()] ?? null;
        break;
      default:
        logger.warn({ value: option.type, name: option.name }, 'unexpected option');
        break;
    }

  // If no content provided, show modal
  if (typeof content === 'undefined') {
    // Store attachment in database if provided, then encode ID in custom_id
    let attachmentCustomId = 'content|';
    if (attachment !== null) {
      assert(typeof attachment.content_type !== 'undefined', 'attachment content_type is required');
      await db.insert(schema.attachment).values({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.content_type,
        url: attachment.url,
        proxyUrl: attachment.proxy_url,
      });
      attachmentCustomId += attachment.id.toString();
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
    } satisfies InteractionResponseModal;
  }

  // Handle normal confession submission using shared function
  try {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: await submitConfession(
          logger,
          timestamp,
          permissions,
          channelId,
          authorId,
          content,
          attachment,
          true,
        ),
      },
    };
  } catch (err) {
    if (err instanceof ConfessError) {
      logger.error(err, err.message);
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags: 64, // Ephemeral flag
          content: err.message,
        },
      };
    }
    throw err;
  }
}
