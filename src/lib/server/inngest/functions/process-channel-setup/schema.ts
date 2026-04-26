import { eventType } from 'inngest';
import { boolean, nullable, object, string } from 'valibot';

const ChannelSetupEventData = object({
  applicationId: string(),
  interactionToken: string(),
  interactionId: string(),
  guildId: string(),
  channelId: string(),
  logChannelId: string(),
  label: nullable(string()),
  color: nullable(string()),
  isApprovalRequired: nullable(boolean()),
});

export const ChannelSetupEvent = eventType('discord/channel.setup', {
  version: '2.0.0',
  schema: ChannelSetupEventData,
});
