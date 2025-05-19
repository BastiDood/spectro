import assert, { fail, strictEqual } from 'node:assert/strict';

import type { Logger } from 'pino';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { channel } from '$lib/server/database/models';
import { db } from '$lib/server/database';

import { ChannelType } from '$lib/server/models/discord/channel';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Resolved } from '$lib/server/models/discord/resolved';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

async function enableConfessions(
    logger: Logger,
    logChannelId: Snowflake,
    guildId: Snowflake,
    channelId: Snowflake,
    label: string | undefined,
    color: number | undefined,
    isApprovalRequired: boolean | undefined,
) {
    const set: PgUpdateSetSource<typeof channel> = {
        logChannelId: sql`excluded.${sql.raw(channel.logChannelId.name)}`,
        disabledAt: sql`excluded.${sql.raw(channel.disabledAt.name)}`,
    };

    if (typeof label !== 'undefined') set.label = sql`excluded.${sql.raw(channel.label.name)}`;
    if (typeof color !== 'undefined') set.color = sql`excluded.${sql.raw(channel.color.name)}`;
    if (typeof isApprovalRequired !== 'undefined')
        set.isApprovalRequired = sql`excluded.${sql.raw(channel.isApprovalRequired.name)}`;

    const [result, ...otherResults] = await db
        .insert(channel)
        .values({
            id: channelId,
            guildId,
            logChannelId,
            label,
            isApprovalRequired,
            color: color?.toString(2).padStart(24, '0'),
            disabledAt: null,
        })
        .onConflictDoUpdate({ target: [channel.guildId, channel.id], set })
        .returning({ label: channel.label, isApprovalRequired: channel.isApprovalRequired });
    strictEqual(otherResults.length, 0);
    assert(typeof result !== 'undefined');

    // TODO: Send a test message to the log channel.
    // TODO: Send a test message to the confession channel.

    logger.info('confessions enabled');
    return result;
}

const HEX_COLOR = /^[0-9a-f]{6}$/iu;
export async function handleSetup(
    logger: Logger,
    resolvedChannels: NonNullable<Resolved['channels']>,
    guildId: Snowflake,
    channelId: Snowflake,
    options: InteractionApplicationCommandChatInputOption[],
) {
    // eslint-disable-next-line @typescript-eslint/init-declarations
    let channel: Snowflake | undefined;
    // eslint-disable-next-line @typescript-eslint/init-declarations
    let label: string | undefined;
    // eslint-disable-next-line @typescript-eslint/init-declarations
    let color: number | undefined;
    // eslint-disable-next-line @typescript-eslint/init-declarations
    let isApprovalRequired: boolean | undefined;

    for (const option of options)
        switch (option.type) {
            case InteractionApplicationCommandChatInputOptionType.Channel:
                channel = option.value;
                break;
            case InteractionApplicationCommandChatInputOptionType.String:
                switch (option.name) {
                    case 'label':
                        label = option.value;
                        break;
                    case 'color':
                        if (HEX_COLOR.test(option.value)) color = Number.parseInt(option.value, 16);
                        else return `\`${option.value}\` is not a valid hex-encoded RGB value.`;
                        break;
                    default:
                        fail(`unexpected setup argument ${option.name}`);
                        break;
                }
                break;
            case InteractionApplicationCommandChatInputOptionType.Boolean:
                strictEqual(option.name, 'approval');
                isApprovalRequired = option.value;
                break;
            default:
                fail(`unexpected option type ${option.type} encountered`);
                break;
        }

    assert(typeof channel !== 'undefined');
    strictEqual(resolvedChannels[channel.toString()]?.type, ChannelType.GuildText);

    const result = await enableConfessions(logger, channel, guildId, channelId, label, color, isApprovalRequired);
    return result.isApprovalRequired
        ? `Only approved confessions (labelled **${result.label}**) are now enabled for this channel.`
        : `Any confessions (labelled **${result.label}**) are now enabled for this channel.`;
}
