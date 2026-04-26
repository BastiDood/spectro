import { strictEqual } from 'node:assert/strict';

import { inngest } from '$lib/server/inngest/client';
import { ConfessionResendEvent } from '$lib/server/inngest/functions/process-confession-resend/schema';
import type { InteractionApplicationCommandChatInputOption } from '$lib/server/models/discord/interaction/application-command/chat-input/option';
import { InteractionApplicationCommandChatInputOptionType } from '$lib/server/models/discord/interaction/application-command/chat-input/option/base';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'webhook.interaction.resend';
const logger = Logger.byName(SERVICE_NAME);
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
      'channel.id': channelId,
      'moderator.id': moderatorId,
      'confession.id': confessionId.toString(),
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
        { ts: timestamp.valueOf() },
      ),
    );
    logger.debug('confession resend queued', { 'inngest.events.id': ids });

    return {
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    };
  });
}
