import { type InferOutput, variant } from 'valibot';

import { InteractionDataMessageComponentButton } from './button';
import { InteractionDataMessageComponentSnowflakeSelect } from './snowflake-select';
import { InteractionDataMessageComponentStringSelect } from './string-select';

export const InteractionMessageComponent = variant('type', [
    InteractionDataMessageComponentButton,
    InteractionDataMessageComponentStringSelect,
    InteractionDataMessageComponentSnowflakeSelect,
]);

export type InteractionMessageComponent = InferOutput<typeof InteractionMessageComponent>;
