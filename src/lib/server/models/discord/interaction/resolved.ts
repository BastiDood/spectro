import { Attachment } from '#lib/server/models/discord/attachment/index.ts';
import { Channel } from '#lib/server/models/discord/channel.ts';
import { GuildMember } from '#lib/server/models/discord/interaction/guild-member.ts';
import { type InferOutput, object, partial, record, string } from 'valibot';
import { Message } from '#lib/server/models/discord/message/index.ts';
import { User } from '#lib/server/models/discord/user.ts';

export const Resolved = partial(
  object({
    users: record(string(), User),
    members: record(string(), GuildMember),
    // TODO: roles
    channels: record(string(), Channel),
    messages: record(string(), Message),
    attachments: record(string(), Attachment),
  }),
);

export type Resolved = InferOutput<typeof Resolved>;
