import { fail } from 'node:assert/strict';

import { parse } from 'valibot';

import { APP_ICON_URL, Color } from '$lib/server/constants';
import { DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { AllowedMentionType } from '$lib/server/models/discord/allowed-mentions';
import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import { type EmbedField, type EmbedImage, EmbedType } from '$lib/server/models/discord/embed';
import { DiscordError, DiscordErrorResponse } from '$lib/server/models/discord/error';
import type { EmbedAttachment } from '$lib/server/models/discord/attachment';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { Logger } from '$lib/server/telemetry/logger';
import { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'api.discord';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

export async function createMessage(channelId: Snowflake, data: CreateMessage, botToken: string) {
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
    throw new DiscordError(code, message);
  });
}

export interface ExternalChannelReference {
  channelId: bigint;
  messageId: bigint;
}

export const enum LogConfessionMode {
  Pending = 0,
  Approved = 1,
  Resent = 2,
}

interface PendingLogOptions {
  mode: LogConfessionMode.Pending;
  internalId: bigint;
}

interface ApprovedLogOptions {
  mode: LogConfessionMode.Approved;
}

interface ResentLogOptions {
  mode: LogConfessionMode.Resent;
  moderatorId: bigint;
}

export type LogConfessionOptions = PendingLogOptions | ApprovedLogOptions | ResentLogOptions;

export async function logConfessionViaHttp(
  timestamp: Date,
  channelId: Snowflake,
  confessionId: bigint,
  authorId: Snowflake,
  label: string,
  description: string,
  attachment: EmbedAttachment | null,
  options: LogConfessionOptions,
  botToken = DISCORD_BOT_TOKEN,
) {
  const fields: EmbedField[] = [
    {
      name: 'Authored by',
      value: `||<@${authorId}>||`,
      inline: true,
    },
  ];

  if (options.mode === LogConfessionMode.Resent)
    fields.push({
      name: 'Resent by',
      value: `<@${options.moderatorId}>`,
      inline: true,
    });

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let image: EmbedImage | undefined;
  if (attachment !== null) {
    fields.push({ name: 'Attachment', value: attachment.url, inline: true });
    // Resent mode does not embed images
    if (options.mode !== LogConfessionMode.Resent && attachment.content_type?.startsWith('image/'))
      image = {
        url: new URL(attachment.url),
        height: attachment.height ?? void 0,
        width: attachment.width ?? void 0,
      };
  }

  // eslint-disable-next-line @typescript-eslint/init-declarations
  let color: Color;
  switch (options.mode) {
    case LogConfessionMode.Pending:
      color = Color.Pending;
      break;
    case LogConfessionMode.Approved:
      color = Color.Success;
      break;
    case LogConfessionMode.Resent:
      color = Color.Replay;
      break;
    default:
      fail('unreachable');
  }

  const params: CreateMessage = {
    flags: MessageFlags.SuppressNotifications,
    allowed_mentions: { parse: [AllowedMentionType.Users] },
    embeds: [
      {
        type: EmbedType.Rich,
        title: `${label} #${confessionId}`,
        color,
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
  };

  if (options.mode === LogConfessionMode.Pending) {
    const customId = options.internalId.toString();
    params.components = [
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
    ];
  }

  return await createMessage(channelId, params, botToken);
}

export async function deferResponse(
  interactionId: Snowflake,
  interactionToken: string,
  botToken = DISCORD_BOT_TOKEN,
) {
  return await tracer.asyncSpan('create-interaction-response', async () => {
    const response = await fetch(
      `${DISCORD_API_BASE_URL}/interactions/${interactionId}/${interactionToken}/callback`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral },
        }),
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
    throw new DiscordError(code, message);
  });
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
    throw new DiscordError(code, message);
  });
}
