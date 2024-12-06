import assert, { fail } from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import { Interaction } from '$lib/server/models/discord/interaction';
import { InteractionApplicationCommandType } from '$lib/server/models/discord/interaction/application-command/base';
import type { InteractionCallback } from '$lib/server/models/discord/interaction-callback';
import { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';
import { InteractionType } from '$lib/server/models/discord/interaction/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';

import { error, json } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import type { Database } from '$lib/server/database';
import type { Logger } from 'pino';

import { handleConfess } from './confess';
import { handleHelp } from './help';
import { handleInfo } from './info';
import { handleLockdown } from './lockdown';
import { handleReplyModal } from './reply-modal';
import { handleReplySubmit } from './reply-submit';
import { handleResend } from './resend';
import { handleSetup } from './setup';

async function handleInteraction(
    db: Database,
    logger: Logger, // TODO: Fine-grained database-level performance logs.
    timestamp: Date,
    interaction: Interaction,
): Promise<InteractionCallback> {
    switch (interaction.type) {
        case InteractionType.Ping:
            return { type: InteractionCallbackType.Pong };
        case InteractionType.ApplicationCommand:
            switch (interaction.data.type) {
                case InteractionApplicationCommandType.ChatInput:
                    switch (interaction.data.name) {
                        case 'confess':
                            assert(typeof interaction.channel_id !== 'undefined');
                            assert(typeof interaction.data.options !== 'undefined');
                            assert(typeof interaction.member?.user !== 'undefined');
                            assert(typeof interaction.member.permissions !== 'undefined');
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleConfess(
                                        db,
                                        logger,
                                        timestamp,
                                        interaction.channel_id,
                                        interaction.member.user.id,
                                        interaction.member.permissions,
                                        interaction.data.options,
                                    ),
                                },
                            };
                        case 'help':
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: handleHelp(logger, interaction.data.options ?? []),
                            };
                        case 'setup':
                            assert(typeof interaction.guild_id !== 'undefined');
                            assert(typeof interaction.channel_id !== 'undefined');
                            assert(typeof interaction.member?.permissions !== 'undefined');
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleSetup(
                                        db,
                                        logger,
                                        interaction.guild_id,
                                        interaction.channel_id,
                                        interaction.member.permissions,
                                        interaction.data.options ?? [],
                                    ),
                                },
                            };
                        case 'lockdown':
                            assert(typeof interaction.channel_id !== 'undefined');
                            assert(typeof interaction.member?.permissions !== 'undefined');
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleLockdown(
                                        db,
                                        logger,
                                        timestamp,
                                        interaction.channel_id,
                                        interaction.member.permissions,
                                    ),
                                },
                            };
                        case 'resend':
                            assert(typeof interaction.channel_id !== 'undefined');
                            assert(typeof interaction.data.options !== 'undefined');
                            assert(typeof interaction.member?.permissions !== 'undefined');
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleResend(
                                        db,
                                        logger,
                                        interaction.channel_id,
                                        interaction.member.permissions,
                                        interaction.data.options,
                                    ),
                                },
                            };
                        case 'info':
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: handleInfo(logger, interaction.data.options ?? []),
                            };
                        default:
                            fail(`unexpected application command chat input name ${interaction.data.name}`);
                            break;
                    }
                    break;
                case InteractionApplicationCommandType.Message:
                    switch (interaction.data.name) {
                        case 'Reply Anonymously':
                            assert(typeof interaction.channel_id !== 'undefined');
                            assert(typeof interaction.member?.permissions !== 'undefined');
                            return await handleReplyModal(
                                db,
                                logger,
                                timestamp,
                                interaction.channel_id,
                                interaction.data.target_id,
                                interaction.member.permissions,
                            );
                        default:
                            fail(`unexpected interaction application command message name ${interaction.data.name}`);
                            break;
                    }
                    break;
                default:
                    fail(`unexpected interaction application command type ${interaction.data.type}`);
                    break;
            }
            break;
        case InteractionType.ModalSubmit:
            switch (interaction.data.custom_id) {
                case 'reply':
                    assert(typeof db !== 'undefined');
                    assert(typeof interaction.channel_id !== 'undefined');
                    assert(typeof interaction.member?.user !== 'undefined');
                    assert(typeof interaction.member.permissions !== 'undefined');
                    return {
                        type: InteractionCallbackType.ChannelMessageWithSource,
                        data: {
                            flags: MessageFlags.Ephemeral,
                            content: await handleReplySubmit(
                                db,
                                logger,
                                timestamp,
                                interaction.channel_id,
                                interaction.member.user.id,
                                interaction.member.permissions,
                                interaction.data.components,
                            ),
                        },
                    };
                default:
                    fail(`unexpected modal submit ${interaction.data.custom_id}`);
                    break;
            }
            break;
        default:
            fail(`unexpected interaction type ${interaction.type}`);
            break;
    }
}

export async function POST({ locals: { ctx }, request }) {
    const ed25519 = request.headers.get('X-Signature-Ed25519');
    if (ed25519 === null) error(400);

    const timestamp = request.headers.get('X-Signature-Timestamp');
    if (timestamp === null) error(400);

    // Used for validating the update time in interactions
    const datetime = new Date(Number.parseInt(timestamp, 10) * 1000);

    const contentType = request.headers.get('Content-Type');
    if (contentType === null || contentType !== 'application/json') error(400);

    const text = await request.text();
    const message = Buffer.from(timestamp + text);
    const signature = Buffer.from(ed25519, 'hex');

    if (await verifyAsync(signature, message, DISCORD_PUBLIC_KEY)) {
        const interaction = JSON.parse(text);
        assert(typeof ctx !== 'undefined');
        const logger = ctx.logger.child({ interaction });
        ctx.logger.info('interaction received');
        const parsed = parse(Interaction, interaction);

        const start = performance.now();
        const response = await handleInteraction(ctx.db, logger, datetime, parsed);
        const interactionTimeMillis = performance.now() - start;
        logger.info({ interactionTimeMillis }, 'interaction processed');

        return json(response);
    }

    error(401);
}
