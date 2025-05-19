import { strictEqual } from 'node:assert/strict';

import type { Logger } from 'pino';

import { handleFatalError } from '$lib/server/logger';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';

export async function doDeferredResponse(logger: Logger, callback: () => Promise<string>) {
    const start = performance.now();
    try {
        const content = await callback();
        const deferredResponseTimeMillis = performance.now() - start;
        logger.info({ deferredResponseTimeMillis, content }, 'deferred response complete');
    } catch (err) {
        handleFatalError(logger, err);
    }
}

export function parsePublic(arg?: InteractionApplicationCommandChatInputOption) {
    if (typeof arg === 'undefined') return false;
    strictEqual(arg.type, InteractionApplicationCommandChatInputOptionType.Boolean);
    return arg.value;
}

export function hasAllPermissions(permissions: bigint, mask: bigint) {
    return (permissions & mask) === mask;
}
