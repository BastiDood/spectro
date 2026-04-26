import { type InferOutput, variant } from 'valibot';

import { MessageComponentChannelSelect } from './channel';
import { MessageComponentMentionableSelect } from './mentionable';
import { MessageComponentRoleSelect } from './role';
import { MessageComponentStringSelect } from './string';
import { MessageComponentUserSelect } from './user';

export { MessageComponentSelectBase } from './base';
export { MessageComponentStringSelect, StringSelectOption } from './string';
export { MessageComponentUserSelect, UserSelectDefaultValue } from './user';
export { MessageComponentRoleSelect, RoleSelectDefaultValue } from './role';
export {
  MessageComponentMentionableSelect,
  MentionableSelectDefaultValue,
  MentionableSelectDefaultValueUser,
  MentionableSelectDefaultValueRole,
} from './mentionable';
export { MessageComponentChannelSelect, ChannelSelectDefaultValue } from './channel';

export const MessageComponentSelect = variant('type', [
  MessageComponentStringSelect,
  MessageComponentUserSelect,
  MessageComponentRoleSelect,
  MessageComponentMentionableSelect,
  MessageComponentChannelSelect,
]);

export type MessageComponentSelect = InferOutput<typeof MessageComponentSelect>;
