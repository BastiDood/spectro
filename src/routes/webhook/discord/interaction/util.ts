import { strictEqual } from 'node:assert/strict';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

const SERVICE_NAME = 'webhook.interaction.util';
const logger = new Logger(SERVICE_NAME);
const tracer = new Tracer(SERVICE_NAME);

export async function doDeferredResponse(callback: () => Promise<string>) {
  // Create detached root span for background work (parent context is gone by now)
  await tracer.asyncSpan('deferred-response', async () => {
    try {
      const content = await callback();
      logger.debug('deferred response complete', { content });
    } catch (err) {
      logger.error('deferred response failed', err instanceof Error ? err : void 0);
    }
  });
}

export function parsePublic(arg?: InteractionApplicationCommandChatInputOption) {
  if (typeof arg === 'undefined') return false;
  strictEqual(arg.type, InteractionApplicationCommandChatInputOptionType.Boolean);
  return arg.value;
}

export function hasAllPermissions(permissions: bigint, mask: bigint) {
  return (permissions & mask) === mask;
}
