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

interface CreateMessageFile {
  data: ArrayBuffer;
  filename: string;
  contentType?: string;
}

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

  async createMessage(
    channelId: Snowflake,
    data: Omit<CreateMessage, 'attachments'>,
    idempotencySeed: string,
    files?: CreateMessageFile[],
  ) {
    return await tracer.asyncSpan('create-message', async span => {
      span.setAttributes({
        'channel.id': channelId,
        'idempotency.seed': idempotencySeed,
      });

      const nonce = await createDiscordNonce(idempotencySeed);
      logger.debug('created discord nonce', { 'idempotency.nonce': nonce });

      // eslint-disable-next-line @typescript-eslint/init-declarations
      let response: Response;
      if (typeof files === 'undefined') {
        response = await fetch(`${DiscordClient.#API_BASE_URL}/channels/${channelId}/messages`, {
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
        });
      } else {
        const form = new FormData();
        form.append(
          'payload_json',
          JSON.stringify({
            ...data,
            nonce,
            enforce_nonce: true,
            attachments: files.map(({ filename }, index) => ({ id: index, filename })),
          } satisfies CreateMessage),
        );

        for (const [index, file] of files.entries())
          form.append(
            `files[${index}]`,
            new Blob([file.data], { type: file.contentType }),
            file.filename,
          );

        response = await fetch(`${DiscordClient.#API_BASE_URL}/channels/${channelId}/messages`, {
          method: 'POST',
          body: form,
          headers: {
            Authorization: this.#botToken,
          },
        });
      }

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

  static async createFollowupMessage(
    applicationId: Snowflake,
    interactionToken: string,
    data: Pick<CreateMessage, 'content' | 'flags'>,
  ) {
    return await tracer.asyncSpan('create-followup-message', async span => {
      // Interaction token is too sensitive to log.
      span.setAttribute('discord.application.id', applicationId);

      const response = await fetch(
        `${DiscordClient.#API_BASE_URL}/webhooks/${applicationId}/${interactionToken}`,
        {
          body: JSON.stringify(data),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (response.status === 200) {
        const json = await response.json();
        const parsed = parse(Message, json);
        logger.debug('follow-up message created', { 'message.id': parsed.id });
        return parsed;
      }

      const json = await response.json();
      const { code, message } = parse(DiscordErrorResponse, json);
      const error = new DiscordError(code, message);
      logger.error('discord api error in createFollowupMessage', error, {
        'discord.error.code': code,
        'discord.error.message': message,
        'discord.application.id': applicationId,
      });
      throw error;
    });
  }
}
