import { type InferOutput, array } from 'valibot';
import { MessageComponentActionRow } from './action-row';

export const MessageComponents = array(MessageComponentActionRow);
export type MessageComponents = InferOutput<typeof MessageComponents>;
