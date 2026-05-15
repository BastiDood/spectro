import { describe, expect, it } from 'vitest';

import { DiscordErrorCode } from '$lib/server/models/discord/errors';

import {
  createConfessionPayload,
  createLogPayload,
  getThreadCreationErrorMessage,
  LogPayloadType,
} from '.';

const confession = {
  confessionId: '42',
  content: 'hello world',
  createdAt: '2026-05-15T00:00:00.000Z',
  parentMessageId: null,
  channel: {
    label: 'Confession',
    color: null,
  },
};

const logConfession = {
  ...confession,
  channelId: '100000000000000001',
  publishChannelId: '100000000000000002',
  authorId: '100000000000000003',
  channel: {
    ...confession.channel,
    guildId: '100000000000000004',
  },
  attachment: null,
  thread: null,
};

describe('createConfessionPayload', () => {
  it('serializes image attachments as embed images', () => {
    const payload = createConfessionPayload({
      ...confession,
      attachment: {
        id: '1234567891233211234',
        filename: 'image.png',
        contentType: 'image/png',
        url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/image.png',
        height: 720,
        width: 1280,
      },
    });

    expect(payload.embeds?.[0]?.image).toEqual({
      url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/image.png',
      height: 720,
      width: 1280,
    });
    expect(payload.embeds?.[0]?.fields).toBeUndefined();
  });

  it('serializes non-image attachments as embed fields', () => {
    const payload = createConfessionPayload({
      ...confession,
      attachment: {
        id: '1234567891233211234',
        filename: 'notes.txt',
        contentType: 'text/plain',
        url: 'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/notes.txt',
      },
    });

    expect(payload.embeds?.[0]?.fields).toEqual([
      {
        name: 'Attachment',
        value:
          'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/notes.txt',
        inline: true,
      },
    ]);
    expect(payload.embeds?.[0]?.image).toBeUndefined();
  });

  it('omits attachment rendering when no attachment exists', () => {
    const payload = createConfessionPayload({
      ...confession,
      attachment: null,
    });

    expect(payload.embeds?.[0]?.image).toBeUndefined();
    expect(payload.embeds?.[0]?.fields).toBeUndefined();
  });
});

describe('createLogPayload', () => {
  it('orders thread reply log fields', () => {
    const payload = createLogPayload(
      {
        ...logConfession,
        parentMessageId: '100000000000000005',
        thread: {
          id: '100000000000000002',
          title: 'A thread title',
        },
      },
      { type: LogPayloadType.Approved },
    );

    expect(payload.embeds?.[0]?.fields).toEqual([
      {
        name: 'Authored by',
        value: '||<@100000000000000003>||',
        inline: true,
      },
      {
        name: 'Parent Channel',
        value: '<#100000000000000001>',
        inline: true,
      },
      {
        name: 'Thread Channel',
        value: '<#100000000000000002>',
        inline: true,
      },
      {
        name: 'Reply To',
        value:
          'https://discord.com/channels/100000000000000004/100000000000000002/100000000000000005',
        inline: true,
      },
    ]);
  });

  it('orders resent thread log fields', () => {
    const payload = createLogPayload(
      {
        ...logConfession,
        thread: {
          id: '100000000000000002',
          title: 'A thread title',
        },
      },
      { type: LogPayloadType.Resent, moderatorId: 100000000000000006n },
    );

    expect(payload.embeds?.[0]?.fields).toEqual([
      {
        name: 'Authored by',
        value: '||<@100000000000000003>||',
        inline: true,
      },
      {
        name: 'Resent by',
        value: '<@100000000000000006>',
        inline: true,
      },
      {
        name: 'Parent Channel',
        value: '<#100000000000000001>',
        inline: true,
      },
      {
        name: 'Thread Channel',
        value: '<#100000000000000002>',
        inline: true,
      },
    ]);
  });

  it('omits thread-only fields for channel logs', () => {
    const payload = createLogPayload(logConfession, { type: LogPayloadType.Approved });

    expect(payload.embeds?.[0]?.fields).toEqual([
      {
        name: 'Authored by',
        value: '||<@100000000000000003>||',
        inline: true,
      },
      {
        name: 'Thread Channel',
        value: '<#100000000000000002>',
        inline: true,
      },
    ]);
  });
});

describe('getThreadCreationErrorMessage', () => {
  it('explains when Discord already has a thread for the selected message', () => {
    expect(
      getThreadCreationErrorMessage(DiscordErrorCode.ThreadAlreadyCreatedForMessage, {
        label: 'Confession',
        confessionId: '42',
      }),
    ).toBe(
      'Confession #42 has been submitted, but Discord already has a thread for the selected message.',
    );
  });

  it('explains when Spectro cannot create more active threads', () => {
    expect(
      getThreadCreationErrorMessage(DiscordErrorCode.MaxActiveThreadsReached, {
        label: 'Confession',
        confessionId: '42',
      }),
    ).toBe(
      'Confession #42 has been submitted, but Discord has reached the maximum number of active threads for this server.',
    );
  });

  it('explains when Spectro lacks Discord permissions to create a thread', () => {
    expect(
      getThreadCreationErrorMessage(DiscordErrorCode.MissingPermissions, {
        label: 'Confession',
        confessionId: '42',
      }),
    ).toBe(
      'Confession #42 has been submitted, but Spectro does not have permission to create the thread.',
    );
  });
});
