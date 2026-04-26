import { dispatchApproval } from './dispatch-approval/index';
import { processChannelLockdown } from './process-channel-lockdown/index';
import { processChannelSetup } from './process-channel-setup/index';
import { processConfessionResend } from './process-confession-resend/index';
import { processConfessionSubmission } from './process-confession-submission/index';

export const functions = [
  processConfessionSubmission,
  processConfessionResend,
  processChannelSetup,
  processChannelLockdown,
  dispatchApproval,
];
