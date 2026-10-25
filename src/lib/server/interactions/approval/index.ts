import { strictEqual } from 'node:assert/strict';

import {
  ConfessionVerdict,
  ConfessionVerdictEvent,
} from '#lib/server/inngest/functions/process-confession-verdict/schema.ts';
import { hasAllFlags } from '#lib/bits.ts';
import { inngest } from '#lib/server/inngest/client/index.ts';
import type { InteractionResponse } from '#lib/server/models/discord/interaction-response/index.ts';
import { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.ts';
import { MalformedCustomIdFormat } from '#lib/server/interactions/errors.ts';
import { MANAGE_MESSAGES } from '#lib/server/models/discord/permission.ts';
import { MessageFlags } from '#lib/server/models/discord/message/base.ts';
import type { Snowflake } from '#lib/server/models/discord/snowflake.ts';
import { Tracer } from '#lib/server/telemetry/tracer.ts';

const SERVICE_NAME = 'webhook.interaction.approval';
const tracer = Tracer.byName(SERVICE_NAME);

function parseVerdict(key: string) {
  switch (key) {
    case 'publish':
      return ConfessionVerdict.Approve;
    case 'delete':
      return ConfessionVerdict.Delete;
    default:
      MalformedCustomIdFormat.throwNew(key);
  }
}

export async function handleApproval(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
  customId: string,
  userId: Snowflake,
  permissions: bigint,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-approval', async span => {
    const [key, internalId, ...rest] = customId.split(':');
    strictEqual(rest.length, 0);
    if (typeof key === 'undefined') MalformedCustomIdFormat.throwNew(customId);
    if (typeof internalId === 'undefined') MalformedCustomIdFormat.throwNew(customId);

    const verdict = parseVerdict(key);
    span.setAttributes({
      'spectro.confession.internal.id': internalId,
      'spectro.moderator.id': userId,
      'spectro.confession.verdict': verdict,
    });

    if (!hasAllFlags(permissions, MANAGE_MESSAGES))
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          flags: MessageFlags.Ephemeral,
          content: 'You need the **"Manage Messages"** permission to approve/reject confessions.',
        },
      };

    const { ids } = await inngest.send(
      ConfessionVerdictEvent.create(
        {
          applicationId,
          interactionToken,
          interactionId,
          internalId,
          moderatorId: userId,
          verdict,
        },
        { id: interactionId, ts: timestamp.valueOf() },
      ),
    );
    span.setAttribute('spectro.inngest.event.ids', ids);

    return { type: InteractionResponseType.DeferredUpdateMessage };
  });
}
