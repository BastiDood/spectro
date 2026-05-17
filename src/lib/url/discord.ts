const DISCORD_ATTACHMENT_CDN_HOST = 'cdn.discordapp.com';

export const enum DiscordAttachmentCdnNamespace {
  Durable = 'attachments',
  Ephemeral = 'ephemeral-attachments',
}

export interface DiscordAttachmentCdnUrl {
  attachmentId: string;
  channelId: string;
  filename: string;
  namespace: DiscordAttachmentCdnNamespace;
  url: URL;
}

function validateAttachmentNamespace(namespace: string) {
  switch (namespace) {
    case DiscordAttachmentCdnNamespace.Durable:
    case DiscordAttachmentCdnNamespace.Ephemeral:
      return namespace;
    default:
      break;
  }
}

export function parseDiscordAttachmentCdnUrl(url: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== DISCORD_ATTACHMENT_CDN_HOST)
    return null;

  const [root, namespace, channelId, attachmentId, filename, ...rest] =
    parsedUrl.pathname.split('/');

  if (root !== '') return null;

  if (
    root !== '' ||
    typeof namespace === 'undefined' ||
    typeof channelId === 'undefined' ||
    channelId === '' ||
    typeof attachmentId === 'undefined' ||
    attachmentId === '' ||
    typeof filename === 'undefined' ||
    filename === '' ||
    rest.length !== 0
  )
    return null;

  const validatedNamespace = validateAttachmentNamespace(namespace);
  if (typeof validatedNamespace === 'undefined') return null;

  return {
    attachmentId,
    channelId,
    filename,
    namespace,
    url: parsedUrl,
  };
}

/** Removes search query parameters from a Discord attachment URL. */
export function normalizeDiscordAttachmentUrl(url: string) {
  const normalizedUrl = new URL(url);
  normalizedUrl.search = '';
  return normalizedUrl.toString();
}
