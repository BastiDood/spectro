import { Buffer } from 'node:buffer';

import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_URL_PATH,
  HTTP_REQUEST_METHOD_VALUE_DELETE,
  HTTP_REQUEST_METHOD_VALUE_PATCH,
  HTTP_REQUEST_METHOD_VALUE_POST,
} from '@opentelemetry/semantic-conventions';
import {
  Channel,
  ChannelType,
  type CreatePublicThread,
  type CreatePublicThreadFromMessage,
} from '#lib/server/models/discord/channel.ts';
import { type CreateMessage, Message } from '#lib/server/models/discord/message/index.ts';
import {
  DiscordError,
  DiscordErrorCode,
  DiscordErrorResponse,
  parseDiscordErrorCode,
} from '#lib/server/models/discord/errors.ts';
import { Logger } from '#lib/server/telemetry/logger/index.ts';
import { parse } from 'valibot';
import type { Snowflake } from '#lib/server/models/discord/snowflake.ts';
import { Tracer } from '#lib/server/telemetry/tracer.ts';

import { DISCORD_BOT_TOKEN } from '$app/env/private';

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
  static readonly #API_ORIGIN = 'https://discord.com';
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
    const path = `/api/v10/channels/${channelId}/messages`;
    return await tracer.asyncSpan('create-message', async span => {
      span.setAttributes({
        [ATTR_HTTP_REQUEST_METHOD]: HTTP_REQUEST_METHOD_VALUE_POST,
        [ATTR_URL_PATH]: path,
        'spectro.discord.channel.id': channelId,
        'spectro.idempotency.seed': idempotencySeed,
      });

      const nonce = await createDiscordNonce(idempotencySeed);
      span.setAttribute('spectro.idempotency.nonce', nonce);

      let response: Response;
      if (typeof files === 'undefined') {
        response = await fetch(`${DiscordClient.#API_ORIGIN}${path}`, {
          body: JSON.stringify({
            ...data,
            nonce,
            enforce_nonce: true,
          } satisfies CreateMessage),
          method: HTTP_REQUEST_METHOD_VALUE_POST,
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

        response = await fetch(`${DiscordClient.#API_ORIGIN}${path}`, {
          method: HTTP_REQUEST_METHOD_VALUE_POST,
          body: form,
          headers: {
            Authorization: this.#botToken,
          },
        });
      }

      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
      const json: unknown = await response.json();

      if (response.status === 200) {
        const parsed = parse(Message, json);
        span.setAttribute('spectro.discord.message.id', parsed.id);
        return parsed;
      }

      const { code, message } = parse(DiscordErrorResponse, json);
      throw new DiscordError(code, message);
    });
  }

  async createPublicThread(channelId: Snowflake, name: string) {
    const path = `/api/v10/channels/${channelId}/threads`;
    return await tracer.asyncSpan('create-public-thread', async span => {
      span.setAttributes({
        [ATTR_HTTP_REQUEST_METHOD]: HTTP_REQUEST_METHOD_VALUE_POST,
        [ATTR_URL_PATH]: path,
        'spectro.discord.channel.id': channelId,
      });

      const response = await fetch(`${DiscordClient.#API_ORIGIN}${path}`, {
        body: JSON.stringify({
          name,
          type: ChannelType.PublicThread,
        } satisfies CreatePublicThread),
        method: HTTP_REQUEST_METHOD_VALUE_POST,
        headers: {
          Authorization: this.#botToken,
          'Content-Type': 'application/json',
        },
      });

      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
      const json: unknown = await response.json();

      if (response.status === 201) {
        const parsed = parse(Channel, json);
        span.setAttribute('spectro.discord.thread.id', parsed.id);
        return parsed;
      }

      const { code, message } = parse(DiscordErrorResponse, json);
      throw new DiscordError(code, message);
    });
  }

  async createPublicThreadFromMessage(channelId: Snowflake, messageId: Snowflake, name: string) {
    const path = `/api/v10/channels/${channelId}/messages/${messageId}/threads`;
    return await tracer.asyncSpan('create-public-thread-from-message', async span => {
      span.setAttributes({
        [ATTR_HTTP_REQUEST_METHOD]: HTTP_REQUEST_METHOD_VALUE_POST,
        [ATTR_URL_PATH]: path,
        'spectro.discord.channel.id': channelId,
        'spectro.discord.message.id': messageId,
      });

      const response = await fetch(`${DiscordClient.#API_ORIGIN}${path}`, {
        body: JSON.stringify({ name } satisfies CreatePublicThreadFromMessage),
        method: HTTP_REQUEST_METHOD_VALUE_POST,
        headers: {
          Authorization: this.#botToken,
          'Content-Type': 'application/json',
        },
      });

      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
      const json: unknown = await response.json();

      if (response.status === 201) {
        const parsed = parse(Channel, json);
        span.setAttribute('spectro.discord.thread.id', parsed.id);
        return parsed;
      }

      const { code, message } = parse(DiscordErrorResponse, json);
      throw new DiscordError(code, message);
    });
  }

  static async createFollowupMessage(
    applicationId: Snowflake,
    interactionToken: string,
    data: Pick<CreateMessage, 'content' | 'flags'>,
  ) {
    const path = `/api/v10/webhooks/${applicationId}`;
    return await tracer.asyncSpan('create-followup-message', async span => {
      span.setAttributes({
        [ATTR_HTTP_REQUEST_METHOD]: HTTP_REQUEST_METHOD_VALUE_POST,
        [ATTR_URL_PATH]: `${path}/REDACTED`,
        'spectro.discord.application.id': applicationId,
      });

      const response = await fetch(`${DiscordClient.#API_ORIGIN}${path}/${interactionToken}`, {
        body: JSON.stringify(data),
        method: HTTP_REQUEST_METHOD_VALUE_POST,
        headers: { 'Content-Type': 'application/json' },
      });

      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
      if (response.status === 200) {
        const json: unknown = await response.json();
        const parsed = parse(Message, json);
        span.setAttribute('spectro.discord.message.id', parsed.id);
        return parsed;
      }

      const json: unknown = await response.json();
      const { code, message } = parse(DiscordErrorResponse, json);
      throw new DiscordError(code, message);
    });
  }

  static async editOriginalInteractionResponse(
    applicationId: Snowflake,
    interactionToken: string,
    data: Partial<CreateMessage>,
  ) {
    const path = `/api/v10/webhooks/${applicationId}`;
    return await tracer.asyncSpan('edit-original-interaction-response', async span => {
      span.setAttributes({
        [ATTR_HTTP_REQUEST_METHOD]: HTTP_REQUEST_METHOD_VALUE_PATCH,
        [ATTR_URL_PATH]: `${path}/REDACTED/messages/@original`,
        'spectro.discord.application.id': applicationId,
      });

      const response = await fetch(
        `${DiscordClient.#API_ORIGIN}${path}/${interactionToken}/messages/@original`,
        {
          body: JSON.stringify(data),
          method: HTTP_REQUEST_METHOD_VALUE_PATCH,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
      if (response.status === 200) {
        const json: unknown = await response.json();
        const parsed = parse(Message, json);
        span.setAttribute('spectro.discord.message.id', parsed.id);
        return parsed;
      }

      const json: unknown = await response.json();
      const { code, message } = parse(DiscordErrorResponse, json);
      throw new DiscordError(code, message);
    });
  }

  /** Ensures that the original interaction response is gone. */
  static async deleteOriginalInteractionResponse(
    applicationId: Snowflake,
    interactionToken: string,
  ) {
    const path = `/api/v10/webhooks/${applicationId}`;
    await tracer.asyncSpan('delete-original-interaction-response', async span => {
      span.setAttributes({
        [ATTR_HTTP_REQUEST_METHOD]: HTTP_REQUEST_METHOD_VALUE_DELETE,
        [ATTR_URL_PATH]: `${path}/REDACTED/messages/@original`,
        'spectro.discord.application.id': applicationId,
      });

      const response = await fetch(
        `${DiscordClient.#API_ORIGIN}${path}/${interactionToken}/messages/@original`,
        { method: HTTP_REQUEST_METHOD_VALUE_DELETE },
      );

      span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
      if (response.status === 204) {
        span.setAttribute('spectro.discord.interaction_response.deleted', true);
        return;
      }

      const json: unknown = await response.json();
      const { code, message } = parse(DiscordErrorResponse, json);
      if (parseDiscordErrorCode(code) === DiscordErrorCode.UnknownWebhook) {
        // The user can delete the ephemeral message before the job responds, leaving the webhook gone.
        span.setAttribute('spectro.discord.interaction_response.already_missing', true);
        logger.warn(
          'Original interaction response webhook is already gone',
          'spectro.discord.api.interaction_response_missing',
          { 'spectro.discord.error.code': code },
        );
        return;
      }
      throw new DiscordError(code, message);
    });
  }
}
