import { parse } from 'valibot';

import { APP_ICON_URL, Color } from '$lib/server/constants';
import { DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import {
  type Embed,
  type EmbedField,
  type EmbedImage,
  EmbedType,
} from '$lib/server/models/discord/embed';
import { AllowedMentionType } from '$lib/server/models/discord/allowed-mentions';
import { DiscordError, DiscordErrorResponse } from '$lib/server/models/discord/error';
import type { EmbedAttachment } from '$lib/server/models/discord/attachment';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import { MessageReferenceType } from '$lib/server/models/discord/message/reference/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'api.discord';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

async function createMessage(channelId: Snowflake, data: CreateMessage, botToken: string) {
  return await tracer.asyncSpan('create-message', async span => {
    span.setAttribute('channel.id', channelId.toString());

    const body = JSON.stringify(data, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );

    const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages`, {
      body,
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });
    const json = await response.json();

    if (response.status === 200) {
      const parsed = parse(Message, json);
      logger.debug('message created', { 'message.id': parsed.id.toString() });
      return parsed;
    }

    const { code, message } = parse(DiscordErrorResponse, json);
    logger.error(
      message,
      { name: 'DiscordError', code, message },
      { statusCode: response.status, code },
    );
    throw new DiscordError(code, message);
  });
}

export async function dispatchConfessionViaHttp(
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

  if (attachment !== null)
    if (attachment.content_type?.includes('image') === true)
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

  return await createMessage(channelId, params, botToken);
}

export interface ExternalChannelReference {
  channelId: bigint;
  messageId: bigint;
}

export async function logPendingConfessionViaHttp(
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

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let image: EmbedImage | undefined;
  if (attachment !== null) {
    fields.push({ name: 'Attachment', value: attachment.url, inline: true });
    if (attachment.content_type?.startsWith('image/') === true)
      image = {
        url: new URL(attachment.url),
        height: attachment.height ?? void 0,
        width: attachment.width ?? void 0,
      };
  }

  const customId = internalId.toString();
  return await createMessage(
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
          image,
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

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let image: EmbedImage | undefined;
  if (attachment !== null) {
    fields.push({ name: 'Attachment', value: attachment.url, inline: true });
    if (attachment.content_type?.startsWith('image/') === true)
      image = {
        url: new URL(attachment.url),
        height: attachment.height ?? void 0,
        width: attachment.width ?? void 0,
      };
  }

  return await createMessage(
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
          image,
        },
      ],
    },
    botToken,
  );
}

export async function logResentConfessionViaHttp(
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
  interactionId: Snowflake,
  interactionToken: string,
  data: InteractionResponse,
  botToken: string,
) {
  const body = JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  return await tracer.asyncSpan('create-interaction-response', async () => {
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

    if (response.status === 204) {
      logger.debug('interaction response created');
      return null;
    }

    const json = await response.json();
    const { code, message } = parse(DiscordErrorResponse, json);
    logger.error(
      message,
      { name: 'DiscordError', code, message },
      { statusCode: response.status, code },
    );
    throw new DiscordError(code, message);
  });
}

export async function deferResponse(
  interactionId: Snowflake,
  interactionToken: string,
  botToken = DISCORD_BOT_TOKEN,
) {
  return await createInteractionResponse(
    interactionId,
    interactionToken,
    {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    },
    botToken,
  );
}

export async function sendFollowupMessage(
  interactionToken: string,
  content: string,
  ephemeral = true,
  applicationId = DISCORD_APPLICATION_ID,
  botToken = DISCORD_BOT_TOKEN,
) {
  return await tracer.asyncSpan('send-followup-message', async () => {
    const response = await fetch(
      `${DISCORD_API_BASE_URL}/webhooks/${applicationId}/${interactionToken}`,
      {
        body: JSON.stringify({
          content,
          flags: ephemeral ? MessageFlags.Ephemeral : 0,
        }),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`,
        },
      },
    );

    if (response.ok) {
      const json = await response.json();
      const parsed = parse(Message, json);
      logger.debug('follow-up message sent', { 'message.id': parsed.id.toString() });
      return parsed;
    }

    const json = await response.json();
    const { code, message } = parse(DiscordErrorResponse, json);
    logger.error(
      message,
      { name: 'DiscordError', code, message },
      { statusCode: response.status, code },
    );
    throw new DiscordError(code, message);
  });
}

export async function editOriginalResponse(
  interactionToken: string,
  content: string,
  applicationId = DISCORD_APPLICATION_ID,
  botToken = DISCORD_BOT_TOKEN,
) {
  return await tracer.asyncSpan('edit-original-response', async () => {
    const response = await fetch(
      `${DISCORD_API_BASE_URL}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
      {
        body: JSON.stringify({ content }),
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${botToken}`,
        },
      },
    );

    if (response.ok) {
      const json = await response.json();
      const parsed = parse(Message, json);
      logger.debug('original response edited', { 'message.id': parsed.id.toString() });
      return parsed;
    }

    const json = await response.json();
    const { code, message } = parse(DiscordErrorResponse, json);
    logger.error(
      message,
      { name: 'DiscordError', code, message },
      { statusCode: response.status, code },
    );
    throw new DiscordError(code, message);
  });
}
