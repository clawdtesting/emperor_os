import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prime-validator-'));
process.env.WORKSPACE_ROOT = tmpRoot;

const { getOrCreateProcState, procSubdir, writeJson, readJson } = await import('../../agent/prime-state.js');
const { buildValidatorScoreCommitHandoff, buildValidatorScoreRevealHandoff, validateValidatorScoreHandoff } = await import('../../validation/score-tx-handoff.js');
const { verifyScoreRevealAgainstCommit } = await import('../../agent/prime-validator-engine.js');
const { PROC_STATUS } = await import('../../agent/prime-phase-model.js');

const procurementId = '91001';
await getOrCreateProcState(procurementId, '501');
await fs.mkdir(procSubdir(procurementId, 'scoring'), { recursive: true });

await writeJson(path.join(procSubdir(procurementId, 'scoring'), 'validator_assignment.json'), {
  procurementId,
  validatorAddress: '0xabc',
  assigned: true,
  checkedAt: new Date().toISOString(),
});
await writeJson(path.join(procSubdir(procurementId, 'scoring'), 'evidence_bundle.json'), { procurementId, evidence: ['a'] });
await writeJson(path.join(procSubdir(procurementId, 'scoring'), 'adjudication_result.json'), {
  score: 77,
  dimensions: { quality: { score: 77 } },
});

const first = await buildValidatorScoreCommitHandoff({
  procurementId,
  score: 77,
  salt: '0x' + '11'.repeat(32),
  adjudication: { score: 77, dimensions: { quality: { score: 77 } } },
});
const second = await buildValidatorScoreCommitHandoff({
  procurementId,
  score: 77,
  salt: '0x' + '11'.repeat(32),
  adjudication: { score: 77, dimensions: { quality: { score: 77 } } },
});
if (first.payload.scoreCommitment !== second.payload.scoreCommitment) {
  throw new Error('deterministic score commit payload generation failed across restart simulation');
}

const reveal = await buildValidatorScoreRevealHandoff({
  procurementId,
  score: 77,
  salt: '0x' + '11'.repeat(32),
  adjudication: { score: 77, dimensions: { quality: { score: 77 } } },
});
const continuity = verifyScoreRevealAgainstCommit({
  score: reveal.payload.score,
  salt: reveal.payload.salt,
  expectedCommitment: first.payload.scoreCommitment,
});
if (!continuity.verified) throw new Error('reveal continuity check should pass for original payload');

const completenessCommit = await validateValidatorScoreHandoff({ procurementId, mode: 'commit' });
if (!completenessCommit.complete) throw new Error('commit package completeness check failed');
const completenessReveal = await validateValidatorScoreHandoff({ procurementId, mode: 'reveal', continuity });
if (!completenessReveal.complete) throw new Error('reveal package completeness check failed');

const persisted = await readJson(path.join(procSubdir(procurementId, 'scoring'), 'score_commit_payload.json'), null);
if (!persisted?.scoreCommitment) throw new Error('score_commit_payload.json missing required scoreCommitment');

console.log('validator lifecycle restart simulation: PASS');
console.log(JSON.stringify({ root: tmpRoot, commitment: first.payload.scoreCommitment }, null, 2));
