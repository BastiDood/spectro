/** Allows management and editing of channels. */
export const MANAGE_CHANNELS = 1n << 4n;

/** Allows for sending messages in a channel and creating threads in a forum (does not allow sending messages in threads) */
export const SEND_MESSAGES = 1n << 11n;

/** Allows for deletion of other users messages. */
export const MANAGE_MESSAGES = 1n << 13n;

/** Allows for users to send attachments with their messages */
export const ATTACH_FILES = 1n << 15n;