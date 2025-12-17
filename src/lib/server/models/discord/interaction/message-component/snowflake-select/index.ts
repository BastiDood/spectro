import { type InferOutput, array, object, picklist, string } from 'valibot';

import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

/**
 * Inbound schema for snowflake select interaction data (user, role, mentionable, channel).
 * Uses variant for component_type since these all share the same values structure.
 */
export const InteractionDataSnowflakeSelect = object({
  component_type: picklist([
    MessageComponentType.UserSelect,
    MessageComponentType.RoleSelect,
    MessageComponentType.MentionableSelect,
    MessageComponentType.ChannelSelect,
  ]),
  custom_id: string(),
  values: array(Snowflake),
});

export type InteractionDataSnowflakeSelect = InferOutput<typeof InteractionDataSnowflakeSelect>;
