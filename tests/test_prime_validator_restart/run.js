import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const now = Math.floor(Date.now() / 1000);
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prime-validator-'));
process.env.WORKSPACE_ROOT = tmpRoot;

const { getOrCreateProcState, setProcState, procSubdir, writeJson, readJson } = await import('../../agent/prime-state.js');
const { buildValidatorScoringPayloads, verifyScoreRevealAgainstCommit } = await import('../../agent/prime-validator-engine.js');
const { computeNextAction } = await import('../../agent/prime-next-action.js');
const { PROC_STATUS } = await import('../../agent/prime-phase-model.js');

const procurementId = '91001';
await getOrCreateProcState(procurementId, '501');
await fs.mkdir(procSubdir(procurementId, 'trial'), { recursive: true });
await writeJson(path.join(procSubdir(procurementId, ''), 'chain_snapshot.json'), { foo: 'bar', n: 1 });
await writeJson(path.join(procSubdir(procurementId, 'trial'), 'trial_artifact_manifest.json'), { trialURI: 'ipfs://example' });

const first = await buildValidatorScoringPayloads({ procurementId, linkedJobId: '501', validatorAddress: '0xabc' });
await setProcState(procurementId, {
  status: PROC_STATUS.WAITING_SCORE_PHASE,
  validatorAssignment: { assigned: true, checkedAt: new Date().toISOString() },
  validatorScoreCommitPayload: first.scoreCommitPayload,
  validatorScoreRevealPayload: first.scoreRevealPayload,
});

const second = await buildValidatorScoringPayloads({ procurementId, linkedJobId: '501', validatorAddress: '0xabc' });
if (first.scoreCommitPayload.scoreCommitment !== second.scoreCommitPayload.scoreCommitment) {
  throw new Error('deterministic payload generation failed across restart simulation');
}

const continuity = verifyScoreRevealAgainstCommit({
  score: first.scoreRevealPayload.score,
  salt: first.scoreRevealPayload.salt,
  expectedCommitment: first.scoreCommitPayload.scoreCommitment,
});
if (!continuity.verified) throw new Error('reveal continuity check should pass for original payload');

const tampered = verifyScoreRevealAgainstCommit({
  score: first.scoreRevealPayload.score,
  salt: `${first.scoreRevealPayload.salt}ff`,
  expectedCommitment: first.scoreCommitPayload.scoreCommitment,
});
if (tampered.verified) throw new Error('reveal continuity check should fail for tampered salt');

const next = computeNextAction({
  procState: await readJson(path.join(procSubdir(procurementId, ''), 'state.json')),
  procStruct: {
    commitDeadline: String(now - 1000),
    revealDeadline: String(now - 900),
    finalistAcceptDeadline: String(now - 800),
    trialDeadline: String(now - 700),
    scoreCommitDeadline: String(now + 600),
    scoreRevealDeadline: String(now + 1600),
  },
});
if (next.action !== 'BUILD_VALIDATOR_SCORE_COMMIT_TX') {
  throw new Error(`expected validator action unlock, got ${next.action}`);
}

console.log('validator lifecycle restart simulation: PASS');
console.log(JSON.stringify({ root: tmpRoot, commitment: first.scoreCommitPayload.scoreCommitment }, null, 2));
