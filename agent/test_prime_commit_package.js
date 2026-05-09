#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execSync } from 'child_process';

const PROC_ID = '424242';
const root = process.cwd();
const appDir = path.join(root, 'artifacts', `proc_${PROC_ID}`, 'application');
const commitmentPath = path.join(appDir, 'commitment_material.json');
const unsignedPath = path.join(appDir, 'unsigned_commit_tx.json');
const reviewPath = path.join(appDir, 'prime_commit_package_review_packet.json');

function run(cmd, expectFailure = false) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
    if (expectFailure) throw new Error(`Expected failure but command succeeded: ${cmd}`);
    return out;
  } catch (err) {
    if (!expectFailure) throw err;
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function main() {
  console.log('[test_prime_commit_package] Preparing fixture prerequisites...');
  run(`node agent/build_prime_candidate_review.js ${PROC_ID} --fixture --force`);
  run(`node agent/build_prime_application_draft.js ${PROC_ID} --fixture --force`);
  run(`node agent/build_prime_commit_material.js ${PROC_ID} --fixture --force`);
  run(`node agent/publish_prime_application.js ${PROC_ID} --fixture --force`);

  const originalCommitment = readJson(commitmentPath);
  const patchedCommitment = {
    ...originalCommitment,
    agentSubdomain: originalCommitment.agentSubdomain && originalCommitment.agentSubdomain.trim() !== ''
      ? originalCommitment.agentSubdomain
      : 'fixture.agent',
    merkleProof: Array.isArray(originalCommitment.merkleProof) && originalCommitment.merkleProof.length > 0
      ? originalCommitment.merkleProof
      : ['0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'],
  };
  writeJson(commitmentPath, patchedCommitment);

  console.log('[test_prime_commit_package] Fixture build should produce real calldata...');
  run(`node agent/approve_prime_commit_package.js ${PROC_ID} --fixture --force`);

  assert(fs.existsSync(unsignedPath), 'unsigned_commit_tx.json missing');
  assert(fs.existsSync(reviewPath), 'prime_commit_package_review_packet.json missing');

  const unsigned = readJson(unsignedPath);
  const review = readJson(reviewPath);

  assert.strictEqual(unsigned.function, 'commitApplication', 'function must be commitApplication');
  assert.strictEqual(typeof unsigned.calldata, 'string', 'calldata must be string');
  assert.ok(unsigned.calldata.startsWith('0x'), 'calldata must start with 0x');
  assert.notStrictEqual(unsigned.calldata, '0x', 'calldata must not be placeholder');
  assert.ok(unsigned.calldata.length > 10, 'calldata length too short');
  assert.ok(String(unsigned.decodedCall || '').includes('commitApplication'), 'decodedCall must contain commitApplication');
  assert.strictEqual(typeof unsigned.args.subdomain, 'string', 'subdomain must be string');
  assert.ok(unsigned.args.subdomain.trim().length > 0, 'subdomain must be non-empty');
  assert.ok(Array.isArray(unsigned.args.proof), 'proof must be array');
  assert.strictEqual(unsigned.humanReviewRequired, true, 'humanReviewRequired must be true');
  assert.strictEqual(unsigned.executableAsIs, false, 'executableAsIs must be false');

  assert.strictEqual(review.safety.humanReviewRequired, true, 'review safety humanReviewRequired must be true');
  assert.strictEqual(review.safety.executableAsIs, false, 'review safety executableAsIs must be false');

  console.log('[test_prime_commit_package] Live/default mode fails closed when applicationURI is null...');
  const liveFailOutput = run(`node agent/approve_prime_commit_package.js ${PROC_ID} --force`, true);
  assert.ok(
    liveFailOutput.includes('applicationURI is null') || liveFailOutput.includes('readyForCommitTx is false'),
    'live/default mode should fail closed when provisional/not-ready'
  );

  console.log('[test_prime_commit_package] Placeholder package rejection and idempotency guard...');
  const backupUnsigned = readJson(unsignedPath);
  const placeholder = {
    ...backupUnsigned,
    calldata: '0x',
    args: { ...(backupUnsigned.args || {}), subdomain: '', proof: [] },
  };
  writeJson(unsignedPath, placeholder);

  const placeholderRejectOut = run(`node agent/approve_prime_commit_package.js ${PROC_ID}`, true);
  assert.ok(placeholderRejectOut.includes('placeholder'), 'placeholder output should be rejected without --force');

  run(`node agent/approve_prime_commit_package.js ${PROC_ID} --fixture --force`);
  const regenerated = readJson(unsignedPath);
  assert.notStrictEqual(regenerated.calldata, '0x', 'regenerated calldata must not be placeholder');

  const idemOut = run(`node agent/approve_prime_commit_package.js ${PROC_ID} --fixture`);
  assert.ok(idemOut.includes('Outputs already exist'), 'idempotency message expected for valid existing output');

  console.log('[test_prime_commit_package] Safety self-check path validated by successful command execution.');

  writeJson(commitmentPath, originalCommitment);
  console.log('[test_prime_commit_package] PASS');
}

main();
