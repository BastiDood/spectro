import { ChannelLockdownEvent } from '$lib/server/inngest/functions/process-channel-lockdown/schema';
import { inngest } from '$lib/server/inngest/client';
import type { InteractionResponse } from '$lib/server/models/discord/interaction-response';
import { InteractionResponseType } from '$lib/server/models/discord/interaction-response/base';
import { MessageFlags } from '$lib/server/models/discord/message/base';
import type { Snowflake } from '$lib/server/models/discord/snowflake';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'webhook.interaction.lockdown';
const tracer = Tracer.byName(SERVICE_NAME);

export async function handleLockdown(
  timestamp: Date,
  applicationId: Snowflake,
  interactionToken: string,
  interactionId: Snowflake,
  channelId: Snowflake,
  moderatorId: Snowflake,
): Promise<InteractionResponse> {
  return await tracer.asyncSpan('handle-lockdown', async span => {
    span.setAttributes({
      'spectro.discord.channel.id': channelId,
      'spectro.moderator.id': moderatorId,
    });

    const { ids } = await inngest.send(
      ChannelLockdownEvent.create(
        {
          applicationId,
          interactionId,
          interactionToken,
          channelId,
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
