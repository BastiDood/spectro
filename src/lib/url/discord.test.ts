import { describe, expect, it } from 'vitest';

import { normalizeDiscordAttachmentUrl, parseDiscordAttachmentCdnUrl } from './discord';

describe('parseDiscordAttachmentCdnUrl', () => {
  it('parses signed Discord attachment CDN URLs', () => {
    const parsed = parseDiscordAttachmentCdnUrl(
      'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/my_image.png?ex=65d903de&is=65c68ede&hm=2481f30dd67f503f54d020ae3b5533b9987fae4e55f2b4e3926e08a3fa3ee24f&',
    );

    expect(parsed).toMatchObject({
      attachmentId: '1234567891233211234',
      channelId: '1012345678900020080',
      filename: 'my_image.png',
    });
  });

  it('rejects non-HTTPS URLs', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'http://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/my_image.png',
      ),
    ).toBeNull();
  });

  it('rejects non-CDN hosts', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'https://discord.com/attachments/1012345678900020080/1234567891233211234/my_image.png',
      ),
    ).toBeNull();
  });

  it('rejects Discord media proxy URLs', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'https://media.discordapp.net/attachments/1012345678900020080/1234567891233211234/my_image.png',
      ),
    ).toBeNull();
  });

  it('rejects non-attachment CDN paths', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'https://cdn.discordapp.com/avatars/374495340902088704/aa236a66d815d3d204b28806e6305064.png',
      ),
    ).toBeNull();
  });

  it('rejects attachment paths with missing channel IDs', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'https://cdn.discordapp.com/attachments//1234567891233211234/my_image.png',
      ),
    ).toBeNull();
  });

  it('rejects attachment paths with missing attachment IDs', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'https://cdn.discordapp.com/attachments/1012345678900020080//my_image.png',
      ),
    ).toBeNull();
  });

  it('rejects attachment paths with missing filenames', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/',
      ),
    ).toBeNull();
  });

  it('rejects attachment paths with extra segments', () => {
    expect(
      parseDiscordAttachmentCdnUrl(
        'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/my_image.png/extra',
      ),
    ).toBeNull();
  });

  it('rejects malformed URLs', () => {
    expect(parseDiscordAttachmentCdnUrl('not a url')).toBeNull();
  });
});

describe('normalizeDiscordAttachmentUrl', () => {
  it('removes query parameters', () => {
    expect(
      normalizeDiscordAttachmentUrl(
        'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/my_image.png?ex=65d903de&is=65c68ede&hm=2481f30dd67f503f54d020ae3b5533b9987fae4e55f2b4e3926e08a3fa3ee24f&',
      ),
    ).toBe(
      'https://cdn.discordapp.com/attachments/1012345678900020080/1234567891233211234/my_image.png',
    );
  });
});
