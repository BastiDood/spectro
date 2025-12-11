import { dispatchApproval } from './dispatch-approval';
import { logConfession } from './log-confession';
import { postConfession } from './post-confession';

export const functions = [postConfession, logConfession, dispatchApproval];
