import {
    type InferOutput,
    array,
    boolean,
    literal,
    number,
    object,
    optional,
    pipe,
    safeInteger,
    string,
    transform,
    union,
    variant,
} from 'valibot';
import { type RawSnowflake, Snowflake } from './snowflake';
import { GuildMember } from './member';

export const enum InteractionType {
    Ping = 1,
    ApplicationCommand,
    MessageComponent,
    ApplicationCommandAutocomplete,
    ModalSubmit,
}

export const BaseInteraction = object({
    version: literal(1),
    id: Snowflake,
    application_id: Snowflake,
    guild_id: optional(Snowflake),
    channel_id: optional(Snowflake),
    token: string(),
    member: optional(GuildMember),
});

export const PingInteraction = object({
    type: literal(InteractionType.Ping),
    ...BaseInteraction.entries,
});

export const BaseApplicationCommandDataOption = object({ name: string() });

export const enum ApplicationCommandDataOptionType {
    SubCommand = 1,
    SubCommandGroup,
    String,
    Integer,
    Boolean,
    User,
    Channel,
    Role,
    Mentionable,
    Number,
    Attachment,
}

export const ApplicationCommandDataOptionString = object({
    type: literal(ApplicationCommandDataOptionType.String),
    value: string(),
    ...BaseApplicationCommandDataOption.entries,
});

export const ApplicationCommandDataOptionInteger = object({
    type: literal(ApplicationCommandDataOptionType.Integer),
    value: pipe(number(), safeInteger()),
    ...BaseApplicationCommandDataOption.entries,
});

export const ApplicationCommandDataOptionBoolean = object({
    type: literal(ApplicationCommandDataOptionType.Boolean),
    value: boolean(),
    ...BaseApplicationCommandDataOption.entries,
});

export const ApplicationCommandDataOptionSnowflake = object({
    type: union([
        literal(ApplicationCommandDataOptionType.User),
        literal(ApplicationCommandDataOptionType.Channel),
        literal(ApplicationCommandDataOptionType.Role),
        literal(ApplicationCommandDataOptionType.Mentionable),
    ]),
    value: Snowflake,
    ...BaseApplicationCommandDataOption.entries,
});

export const ApplicationCommandDataOptionNumber = object({
    type: literal(ApplicationCommandDataOptionType.Number),
    value: number(),
    ...BaseApplicationCommandDataOption.entries,
});

export const ApplicationCommandDataOptionGroupOrSubcommand = object({
    type: union([
        literal(ApplicationCommandDataOptionType.SubCommand),
        literal(ApplicationCommandDataOptionType.SubCommandGroup),
    ]),
    options: array(
        variant('type', [
            ApplicationCommandDataOptionString,
            ApplicationCommandDataOptionInteger,
            ApplicationCommandDataOptionBoolean,
            ApplicationCommandDataOptionSnowflake,
            ApplicationCommandDataOptionNumber,
            // TODO: ApplicationCommandDataOptionAttachment
        ]),
    ),
    ...BaseApplicationCommandDataOption.entries,
});

export const ApplicationCommandDataOption = variant('type', [
    ApplicationCommandDataOptionGroupOrSubcommand,
    ApplicationCommandDataOptionString,
    ApplicationCommandDataOptionInteger,
    ApplicationCommandDataOptionBoolean,
    ApplicationCommandDataOptionSnowflake,
    ApplicationCommandDataOptionNumber,
    // TODO: ApplicationCommandDataOptionAttachment
]);

export type ApplicationCommandDataOption = InferOutput<typeof ApplicationCommandDataOption>;

export const ApplicationCommandInteraction = object({
    type: union([literal(InteractionType.ApplicationCommand), literal(InteractionType.ApplicationCommandAutocomplete)]),
    data: object({
        id: Snowflake,
        name: string(),
        guild_id: optional(Snowflake),
        options: optional(array(ApplicationCommandDataOption)),
        // TODO: resolved
    }),
    ...BaseInteraction.entries,
});

export const enum MessageComponentType {
    ActionRow = 1,
    Button,
    StringSelect,
    TextInput,
    UserSelect,
    RoleSelect,
    MentionableSelect,
    ChannelSelect,
}

export const BaseMessageComponentInteractionData = object({
    custom_id: string(),
    // TODO: resolved
});

export const enum MessageComponentButtonStyle {
    Primary = 1,
    Secondary,
    Success,
    Danger,
    Link,
    Premium,
}

const BaseMessageComponentInteractionDataButton = object({
    label: optional(string()),
    disabled: optional(boolean()),
});

export const MessageComponentInteractionDataButtonNormal = object({
    type: literal(MessageComponentType.Button),
    style: union([
        literal(MessageComponentButtonStyle.Primary),
        literal(MessageComponentButtonStyle.Secondary),
        literal(MessageComponentButtonStyle.Success),
        literal(MessageComponentButtonStyle.Danger),
    ]),
    ...BaseMessageComponentInteractionDataButton.entries,
    ...BaseMessageComponentInteractionData.entries,
});

export const MessageComponentInteractionDataButtonLink = object({
    type: literal(MessageComponentType.Button),
    style: literal(MessageComponentButtonStyle.Link),
    url: pipe(
        string(),
        transform(url => new URL(url)),
    ),
    ...BaseMessageComponentInteractionDataButton.entries,
    ...BaseMessageComponentInteractionData.entries,
});

export const MessageComponentInteractionDataButtonLinkPremium = object({
    type: literal(MessageComponentType.Button),
    style: literal(MessageComponentButtonStyle.Link),
    sku_id: Snowflake,
    ...BaseMessageComponentInteractionDataButton.entries,
    ...BaseMessageComponentInteractionData.entries,
});

export const MessageComponentInteractionDataButton = variant('style', [
    MessageComponentInteractionDataButtonNormal,
    MessageComponentInteractionDataButtonLink,
    MessageComponentInteractionDataButtonLinkPremium,
]);

export const MessageComponentInteractionDataStringSelect = object({
    type: literal(MessageComponentType.StringSelect),
    values: array(string()),
    ...BaseMessageComponentInteractionData.entries,
});

export const MessageComponentInteractionDataSnowflakeSelect = object({
    type: union([
        literal(MessageComponentType.UserSelect),
        literal(MessageComponentType.RoleSelect),
        literal(MessageComponentType.MentionableSelect),
        literal(MessageComponentType.ChannelSelect),
    ]),
    values: array(Snowflake),
    ...BaseMessageComponentInteractionData.entries,
});

export const MessageComponentTextInput = object({
    type: literal(MessageComponentType.TextInput),
    custom_id: string(),
    value: string(),
});

export const MessageComponentInteractionData = variant('type', [
    MessageComponentInteractionDataButton,
    MessageComponentInteractionDataStringSelect,
    MessageComponentInteractionDataSnowflakeSelect,
    MessageComponentTextInput,
]);

export const MessageComponentInteraction = object({
    type: literal(InteractionType.MessageComponent),
    data: MessageComponentInteractionData,
    ...BaseInteraction.entries,
});

export const MessageComponentActionRow = object({
    type: literal(MessageComponentType.ActionRow),
    components: array(MessageComponentInteractionData),
});

export const MessageComponents = array(MessageComponentActionRow);

export const ModalSubmitInteraction = object({
    type: literal(InteractionType.ModalSubmit),
    data: object({
        custom_id: string(),
        components: MessageComponents,
    }),
    ...BaseInteraction.entries,
});

export const Interaction = variant('type', [
    PingInteraction,
    ApplicationCommandInteraction,
    MessageComponentInteraction,
    ModalSubmitInteraction,
]);

export type MessageComponents = InferOutput<typeof MessageComponents>;
export type Interaction = InferOutput<typeof Interaction>;

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

export interface InteractionCallbackPing {
    type: InteractionCallbackType.Pong;
}

export const enum InteractionCallbackMessageDataFlags {
    /** Do not include embeds when serializing this message. */
    SuppressEmbeds = 1 << 2,
    /** This message is only visible to the user who created this interaction. */
    Ephemeral = 1 << 6,
    /** This message will not trigger push and desktop notifications. */
    SuppressNotifications = 1 << 12,
}

export const enum EmbedType {
    Rich = 'rich',
}

export interface RichEmbedMedia {
    url: URL;
    proxy_url?: URL;
    height?: number;
    width?: number;
}

export interface RichEmbed {
    type: EmbedType.Rich;
    title?: string;
    description?: string;
    content?: string;
    url?: URL;
    timestamp?: Date;
    color?: number;
    footer?: {
        text: string;
        icon_url?: URL;
        proxy_icon_url?: URL;
    };
    image?: RichEmbedMedia;
    thumbnail?: RichEmbedMedia;
    video?: RichEmbedMedia;
    author?: {
        name: string;
        url?: URL;
        icon_url?: URL;
        proxy_icon_url?: URL;
    };
    fields?: {
        name: string;
        value: string;
        inline?: boolean;
    }[];
}

export const enum AllowedMentionTypes {
    Roles = 'roles',
    Users = 'users',
    Everyone = 'everyone',
}

export interface AllowedMentions {
    parse: AllowedMentionTypes;
    roles: RawSnowflake[];
    users: RawSnowflake[];
    replied_user: boolean;
}

export interface InteractionCallbackMessageData {
    tts: boolean;
    content: string;
    embeds: RichEmbed[];
    allowed_mentions: Partial<AllowedMentions>;
    flags: InteractionCallbackMessageDataFlags;
    components: MessageComponents;
}

export interface InteractionCallbackMessage {
    type:
    | InteractionCallbackType.ChannelMessageWithSource
    | InteractionCallbackType.DeferredChannelMessageWithSource
    | InteractionCallbackType.DeferredUpdateMessage
    | InteractionCallbackType.UpdateMessage;
    data: Partial<InteractionCallbackMessageData>;
}

export type InteractionCallback = InteractionCallbackPing | InteractionCallbackMessage;
