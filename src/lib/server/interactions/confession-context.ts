import assert from 'node:assert/strict';

import { type Channel, ChannelType } from '$lib/server/models/discord/channel';
import { Logger } from '$lib/server/telemetry/logger';
import type { Snowflake } from '$lib/server/models/discord/snowflake';

const SERVICE_NAME = 'webhook.interaction.channel-context';
const logger = Logger.byName(SERVICE_NAME);

type ChannelRefInput = Pick<Channel, 'id' | 'parent_id' | 'type'>;

export const enum ConfessionDestinationType {
  Channel = 'channel',
  Thread = 'thread',
  Voice = 'voice',
}

export interface ConfessionChannelDestination {
  type: ConfessionDestinationType.Channel;
  channelId: Snowflake;
}

export interface ConfessionThreadDestination {
  type: ConfessionDestinationType.Thread;
  channelId: Snowflake;
  threadId: Snowflake;
  isLocked: boolean;
  title: string;
}

export interface ConfessionVoiceDestination {
  type: ConfessionDestinationType.Voice;
  channelId: Snowflake;
}

export type ConfessionDestination =
  ConfessionChannelDestination | ConfessionThreadDestination | ConfessionVoiceDestination;

export class UnsupportedConfessionChannelError extends Error {
  constructor(public readonly channelType: ChannelType) {
    super(`Confession channel type ${channelType} is not supported.`);
    this.name = 'UnsupportedConfessionChannelError';
  }

  static throwNew(channelType: ChannelType): never {
    const error = new UnsupportedConfessionChannelError(channelType);
    logger.error(
      error.message,
      'spectro.discord.interaction.confession_channel.unsupported',
      { 'spectro.discord.channel.type': error.channelType },
      error,
    );
    throw error;
  }
}

export function resolveConfessionChannelId(channel: ChannelRefInput): Snowflake {
  switch (channel.type) {
    case ChannelType.GuildText:
    case ChannelType.GuildVoice:
      return channel.id;
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      assert(typeof channel.parent_id !== 'undefined');
      assert(channel.parent_id !== null);
      return channel.parent_id;
    default:
      UnsupportedConfessionChannelError.throwNew(channel.type);
  }
}

export function resolveConfessionDestination(
  channel: Pick<Channel, 'id' | 'name' | 'parent_id' | 'thread_metadata' | 'type'>,
): ConfessionDestination {
  switch (channel.type) {
    case ChannelType.GuildText:
      return {
        type: ConfessionDestinationType.Channel,
        channelId: resolveConfessionChannelId(channel),
      };
    case ChannelType.GuildVoice:
      return {
        type: ConfessionDestinationType.Voice,
        channelId: resolveConfessionChannelId(channel),
      };
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      assert(typeof channel.thread_metadata !== 'undefined');
      assert(typeof channel.name === 'string');
      return {
        type: ConfessionDestinationType.Thread,
        channelId: resolveConfessionChannelId(channel),
        threadId: channel.id,
        isLocked: channel.thread_metadata.locked,
        title: channel.name,
      };
    default:
      UnsupportedConfessionChannelError.throwNew(channel.type);
  }
}
