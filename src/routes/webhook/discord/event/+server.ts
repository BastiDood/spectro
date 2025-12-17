import { strictEqual } from 'node:assert/strict';

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
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

async function handleWebhook(timestamp: Date, webhook: Webhook) {
  switch (webhook.type) {
    case WebhookType.Ping:
      logger.info('ping');
      break;
    case WebhookType.Event:
      strictEqual(webhook.event.type, WebhookEventType.ApplicationAuthorized);
      switch (webhook.event.data.integration_type) {
        case IntegrationType.Guild:
          await handleApplicationAuthorized(timestamp, webhook.event.data.guild.id);
          break;
        case IntegrationType.User:
          logger.warn('user installed application', { 'user.id': webhook.event.data.user.id });
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
    logger.error('missing Ed25519 signature header');
    error(400);
  }

  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (timestamp === null) {
    logger.error('missing timestamp header');
    error(400);
  }

  const datetime = new Date(Number.parseInt(timestamp, 10) * 1000);

  const contentType = request.headers.get('Content-Type');
  if (contentType === null || contentType !== 'application/json') {
    logger.error('invalid content type header', void 0, { 'error.content.type': contentType });
    error(400);
  }

  const text = await request.text();
  const message = Buffer.from(timestamp + text);
  const signature = Buffer.from(ed25519, 'hex');

  if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
    const event = parse(Webhook, JSON.parse(text));

    await tracer.asyncSpan('handle-webhook', async span => {
      span.setAttributes({
        'event.type': event.type,
        'event.application.id': event.application_id.toString(),
      });
      await handleWebhook(datetime, event);
    });
    logger.debug('webhook event processed');

    return new Response(null, { status: 204 });
  }

  logger.error('invalid signature');
  error(401);
}
