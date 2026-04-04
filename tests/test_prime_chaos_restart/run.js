import { deriveChainPhase, didMissRequiredWindow, CHAIN_PHASE, PROC_STATUS } from '../../agent/prime-phase-model.js';

const now = Math.floor(Date.now() / 1000);

const missedWindowsCase = {
  commitDeadline: String(now - 500),
  revealDeadline: String(now - 400),
  finalistAcceptDeadline: String(now - 300),
  trialDeadline: String(now - 200),
  scoreCommitDeadline: String(now - 100),
  scoreRevealDeadline: String(now + 100),
};

const delayedPollingCase = {
  commitDeadline: String(now - 200),
  revealDeadline: String(now + 100),
  finalistAcceptDeadline: String(now + 200),
  trialDeadline: String(now + 300),
  scoreCommitDeadline: String(now + 400),
  scoreRevealDeadline: String(now + 500),
};

const partialStateRecoveryCase = {
  commitDeadline: String(now - 800),
  revealDeadline: String(now - 700),
  finalistAcceptDeadline: String(now - 600),
  trialDeadline: String(now - 500),
  scoreCommitDeadline: String(now - 400),
  scoreRevealDeadline: String(now - 300),
};

if (deriveChainPhase(missedWindowsCase) !== CHAIN_PHASE.SCORE_REVEAL) {
  throw new Error('missed window chain phase derivation changed unexpectedly');
}
if (!didMissRequiredWindow(PROC_STATUS.TRIAL_READY, deriveChainPhase(missedWindowsCase))) {
  throw new Error('trial-ready should be marked as missed window outside trial phase');
}
if (deriveChainPhase(delayedPollingCase) !== CHAIN_PHASE.REVEAL_OPEN) {
  throw new Error('delayed polling case should recover into reveal phase deterministically');
}
if (!didMissRequiredWindow(PROC_STATUS.COMMIT_READY, deriveChainPhase(delayedPollingCase))) {
  throw new Error('commit-ready should fail closed once commit window is missed');
}
if (deriveChainPhase(partialStateRecoveryCase) !== CHAIN_PHASE.CLOSED) {
  throw new Error('partial-state recovery case should derive CLOSED chain phase');
}

console.log('chaos/restart deterministic recovery checks: PASS');
