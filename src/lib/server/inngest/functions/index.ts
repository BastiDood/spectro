import { processChannelLockdown } from './process-channel-lockdown/index.ts';
import { processChannelSetup } from './process-channel-setup/index.ts';
import { processConfessionResend } from './process-confession-resend/index.ts';
import { processConfessionSubmission } from './process-confession-submission/index.ts';
import { processConfessionVerdict } from './process-confession-verdict/index.ts';

export const functions = [
  processConfessionSubmission,
  processConfessionResend,
  processChannelSetup,
  processChannelLockdown,
  processConfessionVerdict,
];
