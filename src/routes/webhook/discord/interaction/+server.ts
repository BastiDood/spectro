import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import assert, { fail } from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { Interaction } from '$lib/server/models/discord/interaction';
import { InteractionType } from '$lib/server/models/discord/interaction/base';

import type { InteractionCallback } from '$lib/server/models/discord/interaction-callback';
import { InteractionCallbackType } from '$lib/server/models/discord/interaction-callback/base';

import { InteractionApplicationCommandType } from '$lib/server/models/discord/interaction/application-command/base';

import { MessageFlags } from '$lib/server/models/discord/message/base';

import { error, json } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import { type Database, upsertUser } from '$lib/server/database';
import { handleConfess } from './confess';
import { handleLockdown } from './lockdown';
import { handleReply } from './reply';
import { handleResend } from './resend';
import { handleSet } from './set';
import { handleSetup } from './setup';

async function handleInteraction(
    timestamp: Date,
    interaction: Interaction,
    db?: Database,
): Promise<InteractionCallback> {
    switch (interaction.type) {
        case InteractionType.Ping:
            return { type: InteractionCallbackType.Pong };
        case InteractionType.ApplicationCommand:
            assert(typeof db !== 'undefined');
            assert(typeof interaction.member?.user !== 'undefined');
            switch (interaction.data.type) {
                case InteractionApplicationCommandType.ChatInput:
                    switch (interaction.data.name) {
                        case 'confess':
                            assert(typeof interaction.channel_id !== 'undefined');
                            assert(typeof interaction.data.options !== 'undefined');
                            // await upsertGuild(db, timestamp, interaction.guild);
                            await upsertUser(db, timestamp, interaction.member.user);
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleConfess(
                                        db,
                                        timestamp,
                                        interaction.channel_id,
                                        interaction.member.user.id,
                                        interaction.data.options,
                                    ),
                                },
                            };
                        case 'setup':
                            assert(typeof interaction.guild_id !== 'undefined');
                            assert(typeof interaction.channel_id !== 'undefined');
                            // await upsertGuild(db, timestamp, interaction.guild);
                            await upsertUser(db, timestamp, interaction.member.user);
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleSetup(
                                        db,
                                        interaction.guild_id,
                                        interaction.channel_id,
                                        interaction.member.user.id,
                                        interaction.data.options ?? [],
                                    ),
                                },
                            };
                        case 'lockdown':
                            assert(typeof interaction.guild_id !== 'undefined');
                            assert(typeof interaction.channel_id !== 'undefined');
                            // await upsertGuild(db, timestamp, interaction.guild);
                            await upsertUser(db, timestamp, interaction.member.user);
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleLockdown(
                                        db,
                                        timestamp,
                                        interaction.guild_id,
                                        interaction.channel_id,
                                        interaction.member.user.id,
                                    ),
                                },
                            };
                        case 'set':
                            assert(typeof interaction.guild_id !== 'undefined');
                            assert(typeof interaction.data.options !== 'undefined');
                            // await upsertGuild(db, timestamp, interaction.guild);
                            await upsertUser(db, timestamp, interaction.member.user);
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleSet(
                                        db,
                                        interaction.guild_id,
                                        interaction.member.user.id,
                                        interaction.data.options,
                                    ),
                                },
                            };
                        case 'resend':
                            assert(typeof interaction.guild_id !== 'undefined');
                            assert(typeof interaction.channel_id !== 'undefined');
                            assert(typeof interaction.data.options !== 'undefined');
                            // await upsertGuild(db, timestamp, interaction.guild);
                            await upsertUser(db, timestamp, interaction.member.user);
                            return {
                                type: InteractionCallbackType.ChannelMessageWithSource,
                                data: {
                                    flags: MessageFlags.Ephemeral,
                                    content: await handleResend(
                                        db,
                                        interaction.guild_id,
                                        interaction.channel_id,
                                        interaction.member.user.id,
                                        interaction.data.options,
                                    ),
                                },
                            };
                        default:
                            fail(`unexpected application command chat input name ${interaction.data.name}`);
                            break;
                    }
                    break;
                case InteractionApplicationCommandType.Message:
                    switch (interaction.data.name) {
                        case 'reply':
                            // await upsertGuild(db, timestamp, interaction.guild);
                            await upsertUser(db, timestamp, interaction.member.user);
                            return await handleReply(db, timestamp, interaction.data.target_id);
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
            // TODO
            assert(typeof db !== 'undefined');
            fail('todo');
            // TODO: Add Publication Entry
            break;
        default:
            fail(`unexpected interaction type ${interaction.type}`);
            break;
    }
}

export async function POST({ locals: { db }, request }) {
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
        const obj = JSON.parse(text);
        console.dir(obj, { depth: Infinity });
        const interaction = parse(Interaction, obj);
        return json(await handleInteraction(datetime, interaction, db));
    }

    error(401);
}
