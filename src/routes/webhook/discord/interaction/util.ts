import { setTimeout } from 'node:timers/promises';
import { strictEqual } from 'node:assert/strict';

import type { Logger } from 'pino';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { editOriginalInteractionResponse } from '$lib/server/api/discord';

export async function doDeferredResponse(
    logger: Logger,
    appId: Snowflake,
    token: string,
    callback: () => Promise<string>,
) {
    // HACK: Waiting for our server to respond to Discord.
    await setTimeout(2000);
    const start = performance.now();
    await editOriginalInteractionResponse(logger, appId, token, { content: await callback() });
    const deferredResponseTimeMillis = performance.now() - start;
    logger.info({ deferredResponseTimeMillis }, 'deferred response complete');
}

export function parsePublic(arg?: InteractionApplicationCommandChatInputOption) {
    if (typeof arg === 'undefined') return false;
    strictEqual(arg.type, InteractionApplicationCommandChatInputOptionType.Boolean);
    return arg.value;
}

export function hasAllPermissions(permissions: bigint, mask: bigint) {
    return (permissions & mask) === mask;
}
