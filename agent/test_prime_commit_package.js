#!/usr/bin/env node
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

function run(cmd, env = process.env) {
  return execSync(cmd, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8', env });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  const procId = '424242';
  const envNoRpc = { ...process.env };
  delete envNoRpc.ETH_RPC_URL;

  const procRoot = path.join(repoRoot, 'artifacts', `proc_${procId}`);
  const appDir = path.join(procRoot, 'application');
  const commitmentPath = path.join(appDir, 'commitment_material.json');
  const reviewPath = path.join(appDir, 'commitment_review_packet.json');
  const manifestPath = path.join(appDir, 'commitment_artifact_manifest.json');

  // Clean up
  await fs.rm(procRoot, { recursive: true, force: true });

  // Missing prerequisites should fail closed
  let missingFailed = false;
  try {
    run(`node agent/approve_prime_commit_package.js ${procId} --fixture`, envNoRpc);
  } catch (err) {
    missingFailed = true;
    const out = String(err.stdout || '') + String(err.stderr || '');
    assert.ok(out.includes('Please run previous stages first'), 'missing prerequisites guidance missing');
  }
  assert.ok(missingFailed, 'expected missing prerequisites failure');

  // Generate prerequisites
  run(`node agent/build_prime_candidate_review.js ${procId} --fixture --force`, envNoRpc);
  run(`node agent/build_prime_application_draft.js ${procId} --fixture --force`, envNoRpc);
  run(`node agent/build_prime_commit_material.js ${procId} --fixture --force`, envNoRpc);
  run(`node agent/publish_prime_application.js ${procId} --fixture --force`, envNoRpc);

  // Approve commit package in fixture mode
  const out1 = run(`node agent/approve_prime_commit_package.js ${procId} --fixture --force`, envNoRpc);
  assert.ok(out1.includes('Wrote review packet'), 'review packet missing in output');
  assert.ok(out1.includes('Wrote unsigned tx'), 'unsigned tx missing in output');
  assert.equal(await exists(commitmentPath), true, 'commitment_material.json missing');
  assert.equal(await exists(reviewPath), true, 'commitment_review_packet.json missing');
  assert.equal(await exists(manifestPath), true, 'commitment_artifact_manifest.json missing');

  const reviewPacketPath = path.join(appDir, 'prime_commit_package_review_packet.json');
  const unsignedTxPath = path.join(appDir, 'unsigned_commit_tx.json');
  assert.equal(await exists(reviewPacketPath), true, 'prime_commit_package_review_packet.json missing');
  assert.equal(await exists(unsignedTxPath), true, 'unsigned_commit_tx.json missing');

  const reviewPacket = JSON.parse(await fs.readFile(reviewPacketPath, 'utf8'));
  assert.equal(reviewPacket.schema, 'emperor-os/prime-commit-package-review/v1');
  assert.equal(reviewPacket.humanReviewRequired, true);
  assert.equal(reviewPacket.noSigning, true);
  assert.equal(reviewPacket.noBroadcasting, true);
  assert.equal(reviewPacket.noPrivateKey, true);
  assert.equal(reviewPacket.externalWalletRequired, true);
  assert.equal(reviewPacket.executableAsIs, false);
  assert.equal(reviewPacket.fixture, true);

  const unsignedTx = JSON.parse(await fs.readFile(unsignedTxPath, 'utf8'));
  assert.equal(unsignedTx.schema, 'emperor-os/prime-unsigned-tx/v1');
  assert.equal(unsignedTx.phase, 'COMMIT');
  assert.equal(unsignedTx.function, 'commitApplication');
  assert.equal(unsignedTx.procurementId, procId);
  assert.equal(unsignedTx.humanReviewRequired, true);
  assert.equal(unsignedTx.executableAsIs, false);
  assert.equal(unsignedTx.safety.noPrivateKey, true);
  assert.equal(unsignedTx.safety.noSigning, true);
  assert.equal(unsignedTx.safety.noBroadcasting, true);
  assert.equal(unsignedTx.fixture, true);

  // Check no signing/broadcast/private-key patterns in the script (we already have safety self-check in the script, but we can do a basic check)
  const script = await fs.readFile(path.join(repoRoot, 'agent', 'approve_prime_commit_package.js'), 'utf8');
  assert.ok(!/new\s+ethers\s*\.\s*Wallet\s*\(/.test(script), 'must not construct wallet');
  assert.ok(!/sendTransaction\s*\(/.test(script), 'must not send tx');
  assert.ok(!/signTransaction\s*\(/.test(script), 'must not sign tx');
  assert.ok(!/broadcast\s*\(/.test(script), 'must not broadcast');
  assert.ok(!/PRIVATE_KEY/.test(script), 'must not reference PRIVATE_KEY');
  assert.ok(!/process\s*\.\s*env\s*\.\s*PRIVATE_KEY/.test(script), 'must not reference process.env.PRIVATE_KEY');

  // Idempotency: running again without --force should say files exist
  const out2 = run(`node agent/approve_prime_commit_package.js ${procId} --fixture`, envNoRpc);
  assert.ok(out2.includes('already exist') || out2.includes('Output files already exist'), 'idempotency message missing');

  // Live mode should fail when readyForCommitTx is false (which it is in fixture mode)
  let liveFailed = false;
  try {
    run(`node agent/approve_prime_commit_package.js ${procId}`, envNoRpc);
  } catch (err) {
    liveFailed = true;
    const out = String(err.stdout || '') + String(err.stderr || '');
    assert.ok(out.includes('Live mode: commitment material not ready for commit tx'), 'live mode failure message missing');
  }
  assert.ok(liveFailed, 'expected live mode failure when not ready');

  // Check that state is not marked COMMIT_SUBMITTED (we don't have that field, but we can check that we didn't set something inappropriate)
  const statePath = path.join(procRoot, 'state.json');
  if (await exists(statePath)) {
    const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
    // We set primeCommitPackageReady, but not primeCommitSubmitted
    assert.ok(!state.primeCommitSubmitted, 'state should not be marked primeCommitSubmitted');
  }

  console.log('[test] PASS test_prime_commit_package');
}

main().catch((err) => {
  console.error(`[test] FAIL: ${err.message}`);
  process.exit(1);
});
