import { strictEqual } from 'node:assert/strict';

import { ConfessionResendEvent } from '#lib/server/inngest/functions/process-confession-resend/schema.js';
import { inngest } from '#lib/server/inngest/client/index.js';
import type { InteractionApplicationCommandChatInputOption } from '#lib/server/models/discord/interaction/application-command/chat-input/option/index.js';
import { InteractionApplicationCommandChatInputOptionType } from '#lib/server/models/discord/interaction/application-command/chat-input/option/base.js';
import type { InteractionResponse } from '#lib/server/models/discord/interaction-response/index.js';
import { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.js';
import { MessageFlags } from '#lib/server/models/discord/message/base.js';
import type { Snowflake } from '#lib/server/models/discord/snowflake.js';
import { Tracer } from '#lib/server/telemetry/tracer.js';

const SERVICE_NAME = 'webhook.interaction.resend';
const tracer = Tracer.byName(SERVICE_NAME);

export async function handleResend(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
  permission: bigint,
  channelId: Snowflake,
  moderatorId: Snowflake,
  [option, ...options]: InteractionApplicationCommandChatInputOption[],
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-resend', async span => {
    strictEqual(options.length, 0);
    strictEqual(option?.type, InteractionApplicationCommandChatInputOptionType.Integer);
    strictEqual(option.name, 'confession');

    const confessionId = BigInt(option.value);
    span.setAttributes({
      'spectro.discord.channel.id': channelId,
      'spectro.moderator.id': moderatorId,
      'spectro.confession.id': confessionId.toString(),
    });

    const { ids } = await inngest.send(
      ConfessionResendEvent.create(
        {
          applicationId,
          interactionId,
          interactionToken,
          channelId,
          moderatorId,
          memberPermissions: permission.toString(),
          confessionId: confessionId.toString(),
        },
        { id: interactionId, ts: timestamp.valueOf() },
      ),
    );
    span.setAttribute('spectro.inngest.event.ids', ids);

    return {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    };
  });
}
