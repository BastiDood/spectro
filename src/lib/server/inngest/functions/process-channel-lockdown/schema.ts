import { eventType } from 'inngest';
import { object, string } from 'valibot';

const ChannelLockdownEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  channelId: string(),
});

export const ChannelLockdownEvent = eventType('discord/channel.lockdown', {
  version: '2.0.0',
  schema: ChannelLockdownEventData,
});
