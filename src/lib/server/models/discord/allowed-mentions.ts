import type { RawSnowflake } from './snowflake';

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
