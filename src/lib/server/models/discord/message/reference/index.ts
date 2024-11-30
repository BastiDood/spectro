import { type InferOutput, variant } from 'valibot';

import { MessageReferenceDefault } from './default';
import { MessageReferenceForward } from './forward';

export const MessageReference = variant('type', [MessageReferenceDefault, MessageReferenceForward]);

export type MessageReference = InferOutput<typeof MessageReference>;
