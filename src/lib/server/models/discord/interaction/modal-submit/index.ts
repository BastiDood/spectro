import { type InferOutput, literal, object, optional, string } from 'valibot';

import { InteractionBase, InteractionType } from '$lib/server/models/discord/interaction/base';
import { ModalComponents } from '$lib/server/models/discord/message/component/modal';
import { Resolved } from '$lib/server/models/discord/resolved';

export const InteractionModalSubmit = object({
  ...InteractionBase.entries,
  type: literal(InteractionType.ModalSubmit),
  data: object({
    custom_id: string(),
    components: ModalComponents,
    /** Resolved data for file uploads and other components that reference external resources. */
    resolved: optional(Resolved),
  }),
});

export type InteractionModalSubmit = InferOutput<typeof InteractionModalSubmit>;
