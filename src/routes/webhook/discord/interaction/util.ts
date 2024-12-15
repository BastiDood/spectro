import { strictEqual } from 'node:assert/strict';

import type { Logger } from 'pino';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { editOriginalInteractionResponse } from '$lib/server/api/discord';
import { UnexpectedDiscordErrorCode } from './errors';

export async function doDeferredResponse(
    logger: Logger,
    appId: Snowflake,
    interactionToken: string,
    callback: () => Promise<string>,
) {
    const start = performance.now();
    const content = await callback();
    const result = await editOriginalInteractionResponse(logger, appId, interactionToken, { content });
    if (typeof result === 'number') throw new UnexpectedDiscordErrorCode(result);
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
