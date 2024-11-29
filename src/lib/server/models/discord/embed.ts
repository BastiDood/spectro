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

export type Embed = RichEmbed;
