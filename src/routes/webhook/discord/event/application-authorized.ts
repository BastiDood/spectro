import type { Database } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { permission } from '$lib/server/database/models';
import { strictEqual } from 'node:assert/strict';

export async function handleApplicationAuthorized(db: Database, guildId: Snowflake, userId: Snowflake) {
    // Guild owner must be the first entry into the permission table.
    const { rowCount } = await db.insert(permission).values({ guildId, userId, isAdmin: true });
    strictEqual(rowCount, 1);
}
