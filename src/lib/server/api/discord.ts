import { Buffer } from 'node:buffer';

import { parse } from 'valibot';

import { DISCORD_BOT_TOKEN } from '$lib/server/env/discord';

import { type CreateMessage, Message } from '$lib/server/models/discord/message';
import { DiscordError, DiscordErrorResponse } from '$lib/server/models/discord/errors';
import { Logger } from '$lib/server/telemetry/logger';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'api.discord';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);
const encoder = new TextEncoder();

async function createDiscordNonce(seed: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(seed));
  return Buffer.from(digest).toString('base64url').slice(0, 25);
}

export class DiscordClient {
  static readonly #API_BASE_URL = 'https://discord.com/api/v10';
  static readonly ENV = new DiscordClient(DISCORD_BOT_TOKEN);

  readonly #botToken: string;

  constructor(botToken: string) {
    this.#botToken = `Bot ${botToken}`;
  }

  async createMessage(channelId: Snowflake, data: CreateMessage, idempotencySeed: string) {
    return await tracer.asyncSpan('create-message', async span => {
      span.setAttributes({
        'channel.id': channelId,
        'idempotency.seed': idempotencySeed,
      });

      const nonce = await createDiscordNonce(idempotencySeed);
      logger.debug('created discord nonce', { 'idempotency.nonce': nonce });

      const response = await fetch(
        `${DiscordClient.#API_BASE_URL}/channels/${channelId}/messages`,
        {
          body: JSON.stringify({
            ...data,
            nonce,
            enforce_nonce: true,
          } satisfies CreateMessage),
          method: 'POST',
          headers: {
            Authorization: this.#botToken,
            'Content-Type': 'application/json',
          },
        },
      );

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

  async editOriginalResponse(applicationId: string, interactionToken: string, content: string) {
    return await tracer.asyncSpan('edit-original-response', async () => {
      const response = await fetch(
        `${DiscordClient.#API_BASE_URL}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
        {
          body: JSON.stringify({ content }),
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.#botToken,
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

  async deleteOriginalResponse(applicationId: string, interactionToken: string) {
    return await tracer.asyncSpan('delete-original-response', async () => {
      const response = await fetch(
        `${DiscordClient.#API_BASE_URL}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
        {
          method: 'DELETE',
          headers: { Authorization: this.#botToken },
        },
      );

      if (response.ok) {
        logger.debug('original response deleted');
        return;
      }

      const json = await response.json();
      const { code, message } = parse(DiscordErrorResponse, json);
      const error = new DiscordError(code, message);
      logger.error('discord api error in deleteOriginalResponse', error, {
        'discord.error.code': code,
        'discord.error.message': message,
      });
      throw error;
    });
  }
}
