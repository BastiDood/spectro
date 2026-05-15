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

export type ConfessionDestination = ConfessionChannelDestination | ConfessionThreadDestination;

export class UnsupportedConfessionChannelError extends Error {
  constructor(channelType: ChannelType) {
    super(`This ${channelType} is not supported for confessions.`);
    this.name = 'UnsupportedConfessionChannelError';
  }

  static throwNew(channelType: ChannelType): never {
    const error = new UnsupportedConfessionChannelError(channelType);
    logger.fatal('unsupported confession channel', error, { 'error.channel.type': channelType });
    throw error;
  }
}

export function resolveConfessionChannelId(channel: ChannelRefInput): Snowflake {
  switch (channel.type) {
    case ChannelType.GuildText:
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

export function isConfessionThreadChannel(channel: Pick<Channel, 'type'>) {
  switch (channel.type) {
    case ChannelType.GuildText:
      return false;
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      return true;
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
