import { describe, expect, it } from 'vitest';

import { ChannelType } from '$lib/server/models/discord/channel';

import {
  ConfessionDestinationType,
  resolveConfessionChannelId,
  resolveConfessionDestination,
  UnsupportedConfessionChannelError,
} from './confession-context';

describe('resolveConfessionChannelId', () => {
  it('uses the text channel as the configured confession channel', () => {
    expect(
      resolveConfessionChannelId({
        id: '1012345678900020080',
        parent_id: null,
        type: ChannelType.GuildText,
      }),
    ).toBe('1012345678900020080');
  });

  it('uses the voice channel as the configured confession channel', () => {
    expect(
      resolveConfessionChannelId({
        id: '1012345678900020080',
        parent_id: '2012345678900020080',
        type: ChannelType.GuildVoice,
      }),
    ).toBe('1012345678900020080');
  });

  it.each([ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread])(
    'uses the parent of thread type %s as the configured confession channel',
    type => {
      expect(
        resolveConfessionChannelId({
          id: '2012345678900020080',
          parent_id: '1012345678900020080',
          type,
        }),
      ).toBe('1012345678900020080');
    },
  );

  it('rejects unsupported channel types', () => {
    expect(() =>
      resolveConfessionChannelId({
        id: '1012345678900020080',
        parent_id: null,
        type: ChannelType.DirectMessage,
      }),
    ).toThrow(UnsupportedConfessionChannelError);
  });
});

describe('resolveConfessionDestination', () => {
  it('resolves text channels as channel destinations', () => {
    expect(
      resolveConfessionDestination({
        id: '1012345678900020080',
        name: 'Confessions',
        parent_id: null,
        type: ChannelType.GuildText,
      }),
    ).toEqual({
      type: ConfessionDestinationType.Channel,
      channelId: '1012345678900020080',
    });
  });

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

  it.each([ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread])(
    'preserves the state of thread destination type %s',
    type => {
      expect(
        resolveConfessionDestination({
          id: '2012345678900020080',
          name: 'Anonymous discussion',
          parent_id: '1012345678900020080',
          thread_metadata: { archived: false, locked: true },
          type,
        }),
      ).toEqual({
        type: ConfessionDestinationType.Thread,
        channelId: '1012345678900020080',
        threadId: '2012345678900020080',
        isLocked: true,
        title: 'Anonymous discussion',
      });
    },
  );
});
