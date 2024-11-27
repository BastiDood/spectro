import { DISCORD_PUBLIC_KEY } from '$lib/server/env/discord';

import { upsertGuild, upsertUser } from '$lib/server/database';

import assert, { fail } from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import {
    AllowedMentionTypes,
    Interaction,
    type InteractionCallback,
    InteractionCallbackMessageDataFlags,
    InteractionCallbackType,
    InteractionType,
} from '$lib/server/models/discord/interaction';

import { error, json } from '@sveltejs/kit';
import { parse } from 'valibot';
import { verifyAsync } from '@noble/ed25519';

import type { Database } from '$lib/server/database/index';
import { handleConfess } from './confess';
import { handleLockdown } from './lockdown';
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
            switch (interaction.data.name) {
                case 'confess':
                    assert(typeof db !== 'undefined');
                    assert(typeof interaction.channel_id !== 'undefined');
                    assert(typeof interaction.guild !== 'undefined');
                    assert(typeof interaction.member?.user !== 'undefined');
                    assert(typeof interaction.data.options !== 'undefined');
                    await Promise.all([
                        upsertGuild(db, timestamp, interaction.guild),
                        upsertUser(db, timestamp, interaction.member.user),
                    ]);
                    return {
                        type: InteractionCallbackType.ChannelMessageWithSource,
                        data: {
                            flags: InteractionCallbackMessageDataFlags.Ephemeral,
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
                    assert(typeof db !== 'undefined');
                    assert(typeof interaction.guild !== 'undefined');
                    assert(typeof interaction.channel_id !== 'undefined');
                    assert(typeof interaction.member?.user !== 'undefined');
                    assert(typeof interaction.data.options !== 'undefined');
                    await Promise.all([
                        upsertGuild(db, timestamp, interaction.guild),
                        upsertUser(db, timestamp, interaction.member.user),
                    ]);
                    return {
                        type: InteractionCallbackType.ChannelMessageWithSource,
                        data: {
                            flags: InteractionCallbackMessageDataFlags.Ephemeral,
                            content: await handleSetup(
                                db,
                                interaction.guild.id,
                                interaction.channel_id,
                                interaction.guild.owner_id,
                                interaction.member.user.id,
                                interaction.data.options,
                            ),
                        },
                    };
                case 'lockdown':
                    assert(typeof db !== 'undefined');
                    assert(typeof interaction.guild !== 'undefined');
                    assert(typeof interaction.channel_id !== 'undefined');
                    assert(typeof interaction.member?.user !== 'undefined');
                    await Promise.all([
                        upsertGuild(db, timestamp, interaction.guild),
                        upsertUser(db, timestamp, interaction.member.user),
                    ]);
                    return {
                        type: InteractionCallbackType.ChannelMessageWithSource,
                        data: {
                            flags: InteractionCallbackMessageDataFlags.Ephemeral,
                            content: await handleLockdown(
                                db,
                                timestamp,
                                interaction.guild.id,
                                interaction.channel_id,
                                interaction.guild.owner_id,
                                interaction.member.user.id,
                            ),
                        },
                    };
                case 'set':
                    assert(typeof db !== 'undefined');
                    assert(typeof interaction.guild !== 'undefined');
                    assert(typeof interaction.member?.user !== 'undefined');
                    assert(typeof interaction.data.options !== 'undefined');
                    await Promise.all([
                        upsertGuild(db, timestamp, interaction.guild),
                        upsertUser(db, timestamp, interaction.member.user),
                    ]);
                    return {
                        type: InteractionCallbackType.ChannelMessageWithSource,
                        data: {
                            flags: InteractionCallbackMessageDataFlags.Ephemeral,
                            allowed_mentions: { parse: AllowedMentionTypes.Users },
                            content: await handleSet(
                                db,
                                interaction.guild.id,
                                interaction.member.user.id,
                                interaction.data.options,
                            ),
                        },
                    };
                case 'resend':
                    assert(typeof db !== 'undefined');
                    assert(typeof interaction.guild !== 'undefined');
                    assert(typeof interaction.channel_id !== 'undefined');
                    assert(typeof interaction.member?.user !== 'undefined');
                    assert(typeof interaction.data.options !== 'undefined');
                    await Promise.all([
                        upsertGuild(db, timestamp, interaction.guild),
                        upsertUser(db, timestamp, interaction.member.user),
                    ]);
                    return {
                        type: InteractionCallbackType.ChannelMessageWithSource,
                        data: {
                            flags: InteractionCallbackMessageDataFlags.Ephemeral,
                            content: await handleResend(
                                db,
                                interaction.guild.id,
                                interaction.channel_id,
                                interaction.guild.owner_id,
                                interaction.member.user.id,
                                interaction.data.options,
                            ),
                        },
                    };
                default:
                    fail(`unexpected application command name ${interaction.data.name}`);
                    break;
            }
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
