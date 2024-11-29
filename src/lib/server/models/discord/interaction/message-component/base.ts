import { type InferOutput, object, string } from 'valibot';

export const InteractionDataMessageComponentBase = object({
    custom_id: string(),
    // TODO: resolved
});

export type InteractionDataMessageComponentBase = InferOutput<typeof InteractionDataMessageComponentBase>;
