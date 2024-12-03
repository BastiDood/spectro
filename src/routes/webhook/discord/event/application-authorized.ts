import assert from 'node:assert/strict';

import type { Database } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { permission } from '$lib/server/database/models/app';
import { sql } from 'drizzle-orm';

export async function handleApplicationAuthorized(db: Database, guildId: Snowflake, userId: Snowflake) {
    // Guild owner must be the first entry into the permission table.
    const { rowCount } = await db
        .insert(permission)
        .values({ guildId, userId, isAdmin: true })
        .onConflictDoUpdate({
            target: [permission.userId, permission.guildId],
            // FIXME: There is a subtle edge case here where an admin can be demoted,
            // but if the bot gets re-added into the server (for some reason), then the
            // server owner gets re-promoted as an administrator. Is this what we want?
            set: { isAdmin: sql`excluded.${sql.raw(permission.isAdmin.name)}` },
        });
    assert(rowCount !== null);
}
