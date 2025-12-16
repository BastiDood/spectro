import { parse } from 'valibot';

import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import { DiscordError, DiscordErrorResponse } from '$lib/server/models/discord/errors';
import { Logger } from '$lib/server/telemetry/logger';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'api.discord';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';

export async function createMessage(channelId: Snowflake, data: CreateMessage, botToken: string) {
  return await tracer.asyncSpan('create-message', async span => {
    span.setAttribute('channel.id', channelId);

    const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages`, {
      body: JSON.stringify(data),
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const json = await response.json();

    if (response.status === 200) {
      const parsed = parse(Message, json);
      logger.debug('message created', { 'message.id': parsed.id });
      return parsed;
    }

    const { code, message } = parse(DiscordErrorResponse, json);
    const error = new DiscordError(code, message);
    logger.error('discord api error in createMessage', error, {
      'discord.error.code': code,
      'discord.error.message': message,
      'discord.channel.id': channelId,
    });
    throw error;
  });
}

export async function editOriginalResponse(
  applicationId: string,
  interactionToken: string,
  content: string,
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
      logger.debug('original response edited', { 'message.id': parsed.id });
      return parsed;
    }

    const json = await response.json();
    const { code, message } = parse(DiscordErrorResponse, json);
    const error = new DiscordError(code, message);
    logger.error('discord api error in editOriginalResponse', error, {
      'discord.error.code': code,
      'discord.error.message': message,
    });
    throw error;
  });
}
