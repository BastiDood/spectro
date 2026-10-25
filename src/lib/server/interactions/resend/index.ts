import { strictEqual } from 'node:assert/strict';

import { ConfessionResendEvent } from '#lib/server/inngest/functions/process-confession-resend/schema.ts';
import { inngest } from '#lib/server/inngest/client/index.ts';
import type { InteractionApplicationCommandChatInputOption } from '#lib/server/models/discord/interaction/application-command/chat-input/option/index.ts';
import { InteractionApplicationCommandChatInputOptionType } from '#lib/server/models/discord/interaction/application-command/chat-input/option/base.ts';
import type { InteractionResponse } from '#lib/server/models/discord/interaction-response/index.ts';
import { InteractionResponseType } from '#lib/server/models/discord/interaction-response/base.ts';
import { MessageFlags } from '#lib/server/models/discord/message/base.ts';
import type { Snowflake } from '#lib/server/models/discord/snowflake.ts';
import { Tracer } from '#lib/server/telemetry/tracer.ts';

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
