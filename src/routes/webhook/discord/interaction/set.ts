import { fail, strictEqual } from 'node:assert/strict';

import type { Database } from '$lib/server/database';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { and, eq } from 'drizzle-orm';
import { permission } from '$lib/server/database/models/app';

const enum Role {
    Member = 'member',
    Moderator = 'moderator',
    Admin = 'administrator',
}

function parseRole(role: string) {
    switch (role) {
        case Role.Member:
            return -1;
        case Role.Moderator:
            return 0;
        case Role.Admin:
            return 1;
        default:
            fail(`unexpected role ${role}`);
    }
}

abstract class SetError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'SetError';
    }
}

class SelfOperationError extends SetError {
    constructor() {
        super('You cannot set your own permissions.');
        this.name = 'SelfOperationError';
    }
}

class SelfAdminError extends SetError {
    constructor() {
        super('Only server administrators can set permissions.');
        this.name = 'SelfAdminError';
    }
}

async function setGuildPermissions(
    db: Database,
    guildId: Snowflake,
    selfUserId: Snowflake,
    otherUserId: Snowflake,
    rank: -1 | 0 | 1,
) {
    if (selfUserId === otherUserId) throw new SelfOperationError();

    const [selfPermission, ...selfPermissions] = await db
        .select({ isAdmin: permission.isAdmin })
        .from(permission)
        .where(and(eq(permission.guildId, guildId), eq(permission.userId, selfUserId)))
        .limit(1);
    strictEqual(selfPermissions.length, 0);

    // Server administrators are the only people allowed to upgrade permissions for now
    if (typeof selfPermission === 'undefined' || !selfPermission.isAdmin) throw new SelfAdminError();

    const condition = and(eq(permission.guildId, guildId), eq(permission.userId, otherUserId));

    // eslint-disable-next-line default-case
    switch (rank) {
        case -1:
            await db.delete(permission).where(condition);
            break;
        case 0:
        // falls through
        case 1:
            await db
                .update(permission)
                .set({ isAdmin: Boolean(rank) })
                .where(condition);
            break;
    }
}

export async function handleSet(
    db: Database,
    guildId: Snowflake,
    userId: Snowflake,
    [command, ...commands]: InteractionApplicationCommandChatInputOption[],
) {
    strictEqual(commands.length, 0);
    strictEqual(command?.type, InteractionApplicationCommandChatInputOptionType.SubCommand);
    const role = parseRole(command.name);

    const [option, ...options] = command.options;
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.User);
    strictEqual(option.name, 'user');

    try {
        await setGuildPermissions(db, guildId, userId, option.value, role);
        return `Successfully set <@${option.value}> to ${option.name}.`;
    } catch (err) {
        if (err instanceof SetError) {
            console.error(err);
            return err.message;
        }
        throw err;
    }
}
