export class UnexpectedDiscordErrorCode extends Error {
    constructor(public code: number) {
        super(`unexpected discord error code ${code}`);
        this.name = 'UnexpectedDiscordErrorCode';
    }
}
