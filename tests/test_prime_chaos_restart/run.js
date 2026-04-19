import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

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

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prime-chaos-'));
process.env.WORKSPACE_ROOT = tmpRoot;
const { getOrCreateProcState, procSubdir, writeJson, getProcState } = await import('../../agent/prime-state.js');
const { runValidatorScoreCommit } = await import('../../agent/prime-validator-scoring.js');

const procurementId = '92001';
await getOrCreateProcState(procurementId, '601');
await fs.mkdir(procSubdir(procurementId, 'trial'), { recursive: true });
await writeJson(path.join(procSubdir(procurementId, ''), 'chain_snapshot.json'), {
  procurement: partialStateRecoveryCase,
  chainPhase: CHAIN_PHASE.CLOSED,
});
await writeJson(path.join(procSubdir(procurementId, 'trial'), 'trial_artifact_manifest.json'), { trialUri: 'ipfs://x' });

const blocked = await runValidatorScoreCommit({
  procurementId,
  validatorAddress: '0xabc',
  assignmentOverride: { procurementId, validatorAddress: '0xabc', assigned: true, checkedAt: new Date().toISOString() },
  procStructOverride: partialStateRecoveryCase,
});
if (blocked !== null) throw new Error('expired score commit window must not produce signable handoff');

const state = await getProcState(procurementId);
if (state?.status !== PROC_STATUS.MISSED_WINDOW) {
  throw new Error(`expected MISSED_WINDOW after expired score commit window, got ${state?.status}`);
}

console.log('chaos/restart deterministic recovery checks: PASS');
