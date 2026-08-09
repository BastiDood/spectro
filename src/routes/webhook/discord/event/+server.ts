import { strictEqual } from 'node:assert/strict';

import { ATTR_ENDUSER_ID } from '@opentelemetry/semantic-conventions/incubating';
import { error } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';
import {
  IntegrationType,
  Webhook,
  WebhookEventType,
  WebhookType,
} from '$lib/server/models/discord/event';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { UnreachableCodeError } from '$lib/assert';

import { handleApplicationAuthorized } from './application-authorized';

const SERVICE_NAME = 'webhook.event';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

async function handleWebhook(timestamp: Date, webhook: Webhook) {
  switch (webhook.type) {
    case WebhookType.Ping:
      break;
    case WebhookType.Event:
      strictEqual(webhook.event.type, WebhookEventType.ApplicationAuthorized);
      switch (webhook.event.data.integration_type) {
        case IntegrationType.Guild:
          await handleApplicationAuthorized(timestamp, webhook.event.data.guild.id);
          break;
        case IntegrationType.User:
          logger.warn(
            'User installed application',
            'spectro.discord.webhook_event.user_installed',
            { [ATTR_ENDUSER_ID]: webhook.event.data.user.id },
          );
          break;
        default:
          UnreachableCodeError.throwNew();
      }
      break;
    default:
      UnreachableCodeError.throwNew();
  }
}

export async function POST({ request }) {
  const ed25519 = request.headers.get('X-Signature-Ed25519');
  if (ed25519 === null) {
    logger.error(
      'Missing Ed25519 signature header',
      'spectro.discord.webhook_event.signature_header_missing',
    );
    error(400);
  }

  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (timestamp === null) {
    logger.error(
      'Missing timestamp header',
      'spectro.discord.webhook_event.timestamp_header_missing',
    );
    error(400);
  }

  const datetime = new Date(Number.parseInt(timestamp, 10) * 1000);

  const contentType = request.headers.get('Content-Type');
  if (contentType === null || contentType !== 'application/json') {
    logger.error(
      'Invalid content type header',
      'spectro.discord.webhook_event.content_type_invalid',
    );
    error(400);
  }

  const text = await request.text();
  const message = Buffer.from(timestamp + text);
  const signature = Buffer.from(ed25519, 'hex');

  if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
    const event = parse(Webhook, JSON.parse(text));

    await tracer.asyncSpan('handle-webhook', async span => {
      span.setAttributes({
        'spectro.discord.webhook.event.type': event.type,
        'spectro.discord.application.id': event.application_id.toString(),
      });
      await handleWebhook(datetime, event);
      span.setAttribute('spectro.discord.webhook.handled', true);
    });

    return new Response(null, { status: 204 });
  }

  logger.error('Invalid signature', 'spectro.discord.webhook_event.invalid_signature');
  error(401);
}
