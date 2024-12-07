import { type InferOutput, object, picklist } from 'valibot';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/** @see https://discord.com/developers/docs/resources/channel#channel-object-channel-types */
export const enum ChannelType {
    GuildText = 0,
    DirectMessage = 1,
    GuildVoice = 2,
    GroupDirectMessage = 3,
    GuildCategory = 4,
    GuildAnnouncement = 5,
    AnnouncementThread = 10,
    PublicThread = 11,
    PrivateThread = 12,
    GuildStageVoice = 13,
    GuildDirectory = 14,
    GuildForum = 15,
    GuildMedia = 16,
}

export const Channel = object({
    id: Snowflake,
    type: picklist([
        ChannelType.GuildText,
        ChannelType.DirectMessage,
        ChannelType.GuildVoice,
        ChannelType.GroupDirectMessage,
        ChannelType.GuildCategory,
        ChannelType.GuildAnnouncement,
        ChannelType.AnnouncementThread,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.PrivateThread,
        ChannelType.GuildStageVoice,
        ChannelType.GuildDirectory,
        ChannelType.GuildForum,
        ChannelType.GuildMedia,
    ]),
});

export type Channel = InferOutput<typeof Channel>;
