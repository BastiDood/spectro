const DISCORD_ATTACHMENT_CDN_HOST = 'cdn.discordapp.com';

export interface DiscordAttachmentCdnUrl {
  attachmentId: string;
  channelId: string;
  filename: string;
  url: URL;
}

export function parseDiscordAttachmentCdnUrl(url: string) {
  // eslint-disable-next-line @typescript-eslint/init-declarations
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  const [root, namespace, channelId, attachmentId, filename, ...rest] =
    parsedUrl.pathname.split('/');
  return parsedUrl.protocol === 'https:' &&
    parsedUrl.hostname === DISCORD_ATTACHMENT_CDN_HOST &&
    root === '' &&
    namespace === 'attachments' &&
    typeof channelId === 'string' &&
    channelId.length > 0 &&
    typeof attachmentId === 'string' &&
    attachmentId.length > 0 &&
    typeof filename === 'string' &&
    filename.length > 0 &&
    rest.length === 0
    ? {
        attachmentId,
        channelId,
        filename,
        url: parsedUrl,
      }
    : null;
}

export function normalizeDiscordAttachmentUrl(url: string) {
  const normalizedUrl = new URL(url);
  normalizedUrl.search = '';
  return normalizedUrl.toString();
}
