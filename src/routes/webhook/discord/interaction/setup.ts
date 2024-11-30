import type { Database } from '$lib/server/database';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { channel } from '$lib/server/database/models';
import { sql } from 'drizzle-orm';

import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import assert, { fail, strictEqual } from 'node:assert/strict';

abstract class SetupError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'SetupError';
    }
}

class InsufficientPermissionError extends SetupError {
    constructor() {
        super('You do not have the permission to set up confessions for this channel.');
        this.name = 'InsufficientPermissionError';
    }
}

/** @throws {InsufficientPermissionError} */
async function enableConfessions(
    db: Database,
    guildId: Snowflake,
    channelId: Snowflake,
    userId: Snowflake,
    label?: string,
    isApprovalRequired?: boolean,
) {
    const permission = await db.query.permission.findFirst({
        columns: { isAdmin: true },
        where(table, { and, eq }) {
            return and(eq(table.guildId, guildId), eq(table.userId, userId));
        },
    });

    // No need to check `is_admin` because this command only requires moderator privileges.
    if (typeof permission === 'undefined') throw new InsufficientPermissionError();

    const set: PgUpdateSetSource<typeof channel> = { disabledAt: sql`excluded.${sql.raw(channel.disabledAt.name)}` };
    if (typeof label !== 'undefined') set.label = sql`excluded.${sql.raw(channel.label.name)}`;
    if (typeof isApprovalRequired !== 'undefined')
        set.isApprovalRequired = sql`excluded.${sql.raw(channel.isApprovalRequired.name)}`;

    const [result, ...otherResults] = await db
        .insert(channel)
        .values({ id: channelId, guildId, label, isApprovalRequired, disabledAt: null })
        .onConflictDoUpdate({ target: [channel.guildId, channel.id], set })
        .returning({ label: channel.label, isApprovalRequired: channel.isApprovalRequired });
    strictEqual(otherResults.length, 0);
    assert(typeof result !== 'undefined');
    return result;
}

export async function handleSetup(
    db: Database,
    guildId: Snowflake,
    channelId: Snowflake,
    userId: Snowflake,
    options: InteractionApplicationCommandChatInputOption[],
) {
    // eslint-disable-next-line init-declarations
    let label: string | undefined;
    // eslint-disable-next-line init-declarations
    let isApprovalRequired: boolean | undefined;

    for (const option of options)
        switch (option.type) {
            case InteractionApplicationCommandChatInputOptionType.String:
                strictEqual(option.name, 'label');
                label = option.value;
                break;
            case InteractionApplicationCommandChatInputOptionType.Boolean:
                strictEqual(option.name, 'approval');
                isApprovalRequired = option.value;
                break;
            default:
                fail(`unexpected option type ${option.type} encountered`);
                break;
        }

    try {
        const result = await enableConfessions(db, guildId, channelId, userId, label, isApprovalRequired);
        return result.isApprovalRequired
            ? `Only approved confessions (labelled **${result.label}**) are now enabled for this channel.`
            : `Any confessions (labelled **${result.label}**) are now enabled for this channel.`;
    } catch (err) {
        if (err instanceof SetupError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
