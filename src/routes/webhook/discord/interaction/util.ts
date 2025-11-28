import { strictEqual } from 'node:assert/strict';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

export function parsePublic(arg?: InteractionApplicationCommandChatInputOption) {
  if (typeof arg === 'undefined') return false;
  strictEqual(arg.type, InteractionApplicationCommandChatInputOptionType.Boolean);
  return arg.value;
}

export function hasAllPermissions(permissions: bigint, mask: bigint) {
  return (permissions & mask) === mask;
}
