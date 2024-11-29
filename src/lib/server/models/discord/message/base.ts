export const enum MessageFlags {
    /** Do not include embeds when serializing this message. */
    SuppressEmbeds = 1 << 2,
    /** This message is only visible to the user who created this interaction. */
    Ephemeral = 1 << 6,
    /** This message will not trigger push and desktop notifications. */
    SuppressNotifications = 1 << 12,
}
