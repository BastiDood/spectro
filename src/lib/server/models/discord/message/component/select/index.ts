import { type InferOutput, variant } from 'valibot';

import { MessageComponentChannelSelect } from './channel/index.ts';
import { MessageComponentMentionableSelect } from './mentionable/index.ts';
import { MessageComponentRoleSelect } from './role/index.ts';
import { MessageComponentStringSelect } from './string/index.ts';
import { MessageComponentUserSelect } from './user/index.ts';

export { MessageComponentSelectBase } from './base.ts';
export { MessageComponentStringSelect, StringSelectOption } from './string/index.ts';
export { MessageComponentUserSelect, UserSelectDefaultValue } from './user/index.ts';
export { MessageComponentRoleSelect, RoleSelectDefaultValue } from './role/index.ts';
export {
  MessageComponentMentionableSelect,
  MentionableSelectDefaultValue,
  MentionableSelectDefaultValueUser,
  MentionableSelectDefaultValueRole,
} from './mentionable/index.ts';
export { MessageComponentChannelSelect, ChannelSelectDefaultValue } from './channel/index.ts';

export const MessageComponentSelect = variant('type', [
  MessageComponentStringSelect,
  MessageComponentUserSelect,
  MessageComponentRoleSelect,
  MessageComponentMentionableSelect,
  MessageComponentChannelSelect,
]);

export type MessageComponentSelect = InferOutput<typeof MessageComponentSelect>;
