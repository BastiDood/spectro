import type { AllowedMentions } from '$lib/server/models/discord/allowed-mentions';
import type { Embed } from '$lib/server/models/discord/embed';

import type { MessageComponents } from './component';
import type { MessageFlags } from './base';

export interface Message {
    tts: boolean;
    content: string;
    embeds: Embed[];
    allowed_mentions: Partial<AllowedMentions>;
    flags: MessageFlags;
    components: MessageComponents;
}
