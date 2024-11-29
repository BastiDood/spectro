export const enum InteractionCallbackType {
    /** Acknowledge a ping interaction. */
    Pong = 1,
    /** Respond to an interaction with a message. */
    ChannelMessageWithSource = 4,
    /** Acknowledge the interaction, but edit the response later. User sees loading state. */
    DeferredChannelMessageWithSource = 5,
    /** Acknowledge the interaction, but edit the response later. User does not see loading state. */
    DeferredUpdateMessage = 6,
    /** For components, edit the message the component was attached to. */
    UpdateMessage = 7,
    /** Respond to an autocomplete interaction with suggested choices. */
    ApplicationCommandAutocompleteResult = 8,
    /** Respond to an interaction with a popup modal. */
    Modal = 9,
    /**
     * Respond to an interaction with an upgrade button, only available for apps with [monetization] enabled.
     *
     * [monetization]: https://discord.com/developers/docs/monetization/overview
     *
     * @deprecated
     */
    PremiumRequired = 10,
    /**
     * Launch the Activity associated with the app. Only available for apps with [Activities] enabled.
     *
     * [Activities]: https://discord.com/developers/docs/activities/overview
     */
    LaunchActivity = 12,
}
