import { boolean, nullable, object, string } from 'valibot';
import { eventType } from 'inngest';

const ChannelSetupEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  guildId: string(),
  channelId: string(),
  targetChannelId: string(),
  logChannelId: string(),
  label: nullable(string()),
  color: nullable(string()),
  isApprovalRequired: nullable(boolean()),
});

export const ChannelSetupEvent = eventType('discord/channel.setup', {
  version: '3.0.0',
  schema: ChannelSetupEventData,
});
