import type { Database } from '$lib/server/database';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

import { type NewConfession, confession } from '$lib/server/database/models';
import assert, { strictEqual } from 'node:assert/strict';
import { dispatchConfessionViaWebhook } from '$lib/server/api/discord';

export class ConfessUnknownChannelError extends Error {
    constructor(public channelId: Snowflake) {
        super(`unknown channel id ${channelId}`);
        this.name = 'ConfessUnknownChannelError';
    }
}

export class ConfessDisabledChannelError extends Error {
    constructor(public disabledAt: Date) {
        super(`confession channel is disabled ${disabledAt.toISOString()}`);
        this.name = 'ConfessDisabledChannelError';
    }
}

export class ConfessMissingWebhookError extends Error {
    constructor() {
        super('missing confession webhook');
        this.name = 'ConfessMissingWebhookError';
    }
}

export class ConfessWebhookDeliveryError extends Error {
    constructor() {
        super('failed to deliver the webhook');
        this.name = 'ConfessWebhookDeliveryError';
    }
}

/**
 * @throws {ConfessUnknownChannelError}
 * @throws {ConfessDisabledChannelError}
 * @throws {ConfessMissingWebhookError}
 * @throws {ConfessWebhookDeliveryError}
 */
export async function submitConfession(
    db: Database,
    createdAt: Date,
    channelId: Snowflake,
    authorId: Snowflake,
    content: string,
) {
    await db.transaction(
        async tx => {
            const channel = await tx.query.channel.findFirst({
                with: { webhook: true },
                columns: { disabledAt: true, isApprovalRequired: true, label: true },
                where({ id }, { eq }) {
                    return eq(id, channelId);
                },
            });

            if (typeof channel === 'undefined') throw new ConfessUnknownChannelError(channelId);
            const { disabledAt, label, isApprovalRequired, webhook } = channel;

            if (disabledAt !== null) throw new ConfessDisabledChannelError(disabledAt);

            if (webhook === null) throw new ConfessMissingWebhookError();
            const { id, token } = webhook;

            const newConfession: NewConfession = { createdAt, channelId, authorId, content };
            if (isApprovalRequired) newConfession.approvedAt = null;

            const [result, ...otherResults] = await tx
                .insert(confession)
                .values(newConfession)
                .returning({ confessionId: confession.confessionId });
            strictEqual(otherResults.length, 0);
            assert(typeof result !== 'undefined');

            // TODO: Assign the correct confession IDs.
            if (await dispatchConfessionViaWebhook(id, token, result.confessionId, label, createdAt, content)) return;
            throw new ConfessWebhookDeliveryError();
        },
        { isolationLevel: 'read committed' },
    );
}
