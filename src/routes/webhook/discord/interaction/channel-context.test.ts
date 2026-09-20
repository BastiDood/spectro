import { describe, expect, it } from 'vitest';

import { ChannelType } from '$lib/server/models/discord/channel';

import {
  ConfessionDestinationType,
  resolveConfessionChannelId,
  resolveConfessionDestination,
} from './channel-context';

describe('resolveConfessionChannelId', () => {
  it('uses the voice channel as the configured confession channel', () => {
    expect(
      resolveConfessionChannelId({
        id: '1012345678900020080',
        parent_id: '2012345678900020080',
        type: ChannelType.GuildVoice,
      }),
    ).toBe('1012345678900020080');
  });
});

describe('resolveConfessionDestination', () => {
  it('resolves voice channels as regular confession destinations', () => {
    expect(
      resolveConfessionDestination({
        id: '1012345678900020080',
        name: 'Voice',
        parent_id: null,
        type: ChannelType.GuildVoice,
      }),
    ).toEqual({
      type: ConfessionDestinationType.Voice,
      channelId: '1012345678900020080',
    });
  });
});
