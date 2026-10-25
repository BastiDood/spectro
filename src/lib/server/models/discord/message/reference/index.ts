import { type InferOutput, variant } from 'valibot';

import { MessageReferenceDefault } from './default/index.ts';
import { MessageReferenceForward } from './forward/index.ts';

export const MessageReference = variant('type', [MessageReferenceDefault, MessageReferenceForward]);

export type MessageReference = InferOutput<typeof MessageReference>;
