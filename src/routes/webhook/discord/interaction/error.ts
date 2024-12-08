import type { MessageComponentButtonStyle } from '$lib/server/models/discord/message/component/button/base';

export class UnexpectedDiscordErrorCode extends Error {
    constructor(public code: number) {
        super(`unexpected discord error code ${code}`);
        this.name = 'UnexpectedDiscordErrorCode';
    }
}

export class UnexpectedMessageComponentButtonStyle extends Error {
    constructor(public style: MessageComponentButtonStyle) {
        super(`unexpected message component button style ${style}`);
        this.name = 'UnexpectedMessageComponentButtonStyle';
    }
}
