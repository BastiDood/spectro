import type { Logger } from 'pino';
import { parse } from 'valibot';

import { APP_ICON_URL, Color } from '$lib/server/constants';
import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import { type Embed, type EmbedField, EmbedType } from '$lib/server/models/discord/embed';
import { AllowedMentionType } from '$lib/server/models/discord/allowed-mentions';
import { DiscordError } from '$lib/server/models/discord/error';
import type { EmbedAttachment } from '$lib/server/models/discord/attachment';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

async function createMessage(
  logger: Logger,
  channelId: Snowflake,
  data: CreateMessage,
  botToken: string,
) {
  const body = JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  const start = performance.now();
  const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages`, {
    body,
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
  });
  const json = await response.json();
  const createMessageTimeMillis = performance.now() - start;
  const child = logger.child({ createMessageTimeMillis });

  if (response.status === 200) {
    const parsed = parse(Message, json);
    child.info({ createMessage: parsed });
    return parsed;
  }

  const { code, message } = parse(DiscordError, json);
  child.error({ statusCode: response.status }, message);
  return code;
}

export async function dispatchConfessionViaHttp(
  logger: Logger,
  timestamp: Date,
  channelId: Snowflake,
  confessionId: bigint,
  label: string,
  color: number | undefined,
  description: string,
  replyToMessageId: Snowflake | null,
  attachment: EmbedAttachment | null,
  botToken = DISCORD_BOT_TOKEN,
) {
  const embed: Embed = {
    type: EmbedType.Rich,
    title: `${label} #${confessionId}`,
    description,
    timestamp,
    color,
    footer: {
      text: "Admins can access Spectro's confession logs",
      icon_url: APP_ICON_URL,
    },
  };

  if (typeof attachment?.content_type !== 'undefined')
    if (attachment.content_type.includes('image'))
      embed.image = {
        url: new URL(attachment.url),
        height: attachment.height ?? void 0,
        width: attachment.width ?? void 0,
      };
    else embed.fields = [{ name: 'Attachment', value: attachment.url, inline: true }];

  const params: CreateMessage = { embeds: [embed] };
  if (replyToMessageId !== null)
    params.message_reference = {
      type: MessageReferenceType.Default,
      message_id: replyToMessageId,
      fail_if_not_exists: false,
    };

  return await createMessage(logger, channelId, params, botToken);
}

export interface ExternalChannelReference {
  channelId: bigint;
  messageId: bigint;
}

export async function logPendingConfessionViaHttp(
  logger: Logger,
  timestamp: Date,
  channelId: Snowflake,
  internalId: bigint,
  confessionId: bigint,
  authorId: Snowflake,
  label: string,
  description: string,
  attachment: EmbedAttachment | null,
  botToken = DISCORD_BOT_TOKEN,
) {
  const fields: EmbedField[] = [
    {
      name: 'Authored by',
      value: `||<@${authorId}>||`,
      inline: true,
    },
  ];

  if (attachment !== null) fields.push({ name: 'Attachment', value: attachment.url, inline: true });

  const customId = internalId.toString();
  return await createMessage(
    logger,
    channelId,
    {
      flags: MessageFlags.SuppressNotifications,
      allowed_mentions: { parse: [AllowedMentionType.Users] },
      embeds: [
        {
          type: EmbedType.Rich,
          title: `${label} #${confessionId}`,
          color: Color.Pending,
          timestamp,
          description,
          footer: {
            text: 'Spectro Logs',
            icon_url: APP_ICON_URL,
          },
          fields,
        },
      ],
      components: [
        {
          type: MessageComponentType.ActionRow,
          components: [
            {
              type: MessageComponentType.Button,
              style: MessageComponentButtonStyle.Success,
              label: 'Publish',
              emoji: { name: '\u{2712}\u{fe0f}' },
              custom_id: `publish:${customId}`,
            },
            {
              type: MessageComponentType.Button,
              style: MessageComponentButtonStyle.Danger,
              label: 'Delete',
              emoji: { name: '\u{1f5d1}\u{fe0f}' },
              custom_id: `delete:${customId}`,
            },
          ],
        },
      ],
    },
    botToken,
  );
}

export async function logApprovedConfessionViaHttp(
  logger: Logger,
  timestamp: Date,
  channelId: Snowflake,
  confessionId: bigint,
  authorId: Snowflake,
  label: string,
  description: string,
  attachment: EmbedAttachment | null,
  botToken = DISCORD_BOT_TOKEN,
) {
  const fields = [
    {
      name: 'Authored by',
      value: `||<@${authorId}>||`,
      inline: true,
    },
  ];

  if (attachment !== null) fields.push({ name: 'Attachment', value: attachment.url, inline: true });

  return await createMessage(
    logger,
    channelId,
    {
      flags: MessageFlags.SuppressNotifications,
      allowed_mentions: { parse: [AllowedMentionType.Users] },
      embeds: [
        {
          type: EmbedType.Rich,
          title: `${label} #${confessionId}`,
          color: Color.Success,
          timestamp,
          description,
          footer: {
            text: 'Spectro Logs',
            icon_url: APP_ICON_URL,
          },
          fields,
        },
      ],
    },
    botToken,
  );
}

export async function logResentConfessionViaHttp(
  logger: Logger,
  timestamp: Date,
  channelId: Snowflake,
  confessionId: bigint,
  authorId: Snowflake,
  moderatorId: Snowflake,
  label: string,
  description: string,
  attachment: EmbedAttachment | null,
  botToken = DISCORD_BOT_TOKEN,
) {
  const fields = [
    {
      name: 'Authored by',
      value: `||<@${authorId}>||`,
      inline: true,
    },
    {
      name: 'Resent by',
      value: `<@${moderatorId}>`,
      inline: true,
    },
  ];

  if (attachment !== null) fields.push({ name: 'Attachment', value: attachment.url, inline: true });

  return await createMessage(
    logger,
    channelId,
    {
      flags: MessageFlags.SuppressNotifications,
      allowed_mentions: { parse: [AllowedMentionType.Users] },
      embeds: [
        {
          type: EmbedType.Rich,
          title: `${label} #${confessionId}`,
          color: Color.Replay,
          timestamp,
          description,
          footer: {
            text: 'Spectro Logs',
            icon_url: APP_ICON_URL,
          },
          fields,
        },
      ],
    },
    botToken,
  );
}

async function createInteractionResponse(
  logger: Logger,
  interactionId: Snowflake,
  interactionToken: string,
  data: InteractionResponse,
  botToken: string,
) {
  const body = JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  const start = performance.now();
  const response = await fetch(
    `${DISCORD_API_BASE_URL}/interactions/${interactionId}/${interactionToken}/callback`,
    {
      body,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${botToken}`,
      },
    },
  );
  const createInteractionResponseTimeMillis = performance.now() - start;
  const child = logger.child({ createInteractionResponseTimeMillis });

  if (response.status === 204) {
    child.info('interaction response created');
    return null;
  }

  const json = await response.json();
  const { code, message } = parse(DiscordError, json);
  child.error({ statusCode: response.status }, message);
  return code;
}

export async function deferResponse(
  logger: Logger,
  interactionId: Snowflake,
  interactionToken: string,
  botToken = DISCORD_BOT_TOKEN,
) {
  return await createInteractionResponse(
    logger,
    interactionId,
    interactionToken,
    {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    },
    botToken,
  );
}
