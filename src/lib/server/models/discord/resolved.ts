import { type InferOutput, object, partial, record, string } from 'valibot';

import { Channel } from '$lib/server/models/discord/channel';
import { GuildMember } from '$lib/server/models/discord/guild-member';
import { Message } from '$lib/server/models/discord/message';
import { User } from '$lib/server/models/discord/user';

export const Resolved = partial(
    object({
        users: record(string(), User),
        members: record(string(), GuildMember),
        // TODO: roles
        channels: record(string(), Channel),
        messages: record(string(), Message),
    }),
);

export type Resolved = InferOutput<typeof Resolved>;
