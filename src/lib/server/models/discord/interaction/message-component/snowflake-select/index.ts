import { type InferOutput, array, literal, object, union } from 'valibot';

import { InteractionDataMessageComponentBase } from '$lib/server/models/discord/interaction/message-component/base';
import { MessageComponentType } from '$lib/server/models/discord/message/component/base';
import { Snowflake } from '$lib/server/models/discord/snowflake';

export const InteractionDataMessageComponentSnowflakeSelect = object({
  ...InteractionDataMessageComponentBase.entries,
  type: union([
    literal(MessageComponentType.UserSelect),
    literal(MessageComponentType.RoleSelect),
    literal(MessageComponentType.MentionableSelect),
    literal(MessageComponentType.ChannelSelect),
  ]),
  values: array(Snowflake),
});

export type InteractionDataMessageComponentSnowflakeSelect = InferOutput<
  typeof InteractionDataMessageComponentSnowflakeSelect
>;

export const DeserializedInteractionDataMessageComponentSnowflakeSelect = object({
  ...InteractionDataMessageComponentBase.entries,
  component_type: union([
    literal(MessageComponentType.UserSelect),
    literal(MessageComponentType.RoleSelect),
    literal(MessageComponentType.MentionableSelect),
    literal(MessageComponentType.ChannelSelect),
  ]),
  values: array(Snowflake),
});

export type DeserializedInteractionDataMessageComponentSnowflakeSelect = InferOutput<
  typeof DeserializedInteractionDataMessageComponentSnowflakeSelect
>;
