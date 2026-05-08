#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const procurementId = '424242';
const baseDir = join('artifacts', `proc_${procurementId}`, 'application');

// Clear environment variables for storage
delete process.env.IPFS_PUBLISH_ENABLED;
delete process.env.PINATA_JWT;

// Run the publish command in fixture mode with force
console.log('[test] Running: node agent/publish_prime_application.js 424242 --fixture --force');
execSync(`node agent/publish_prime_application.js ${procurementId} --fixture --force`, { stdio: 'inherit' });

// 1. Check pending file exists
const pendingPath = join(baseDir, 'application_storage_pending.json');
if (!existsSync(pendingPath)) {
  console.error(`[test] FAIL: Missing ${pendingPath}`);
  process.exit(1);
}

// 2. Check report file exists
const reportPath = join(baseDir, 'application_publication_staging_report.json');
if (!existsSync(reportPath)) {
  console.error(`[test] FAIL: Missing ${reportPath}`);
  process.exit(1);
}

// 3. Read and validate pending file has the right schema and status
let pending;
try {
  pending = JSON.parse(readFileSync(pendingPath, 'utf8'));
} catch (e) {
  console.error(`[test] FAIL: Could not parse pending file: ${e}`);
  process.exit(1);
}
if (pending.schema !== 'emperor-os/prime-application-storage-pending/v1') {
  console.error(`[test] FAIL: Wrong schema in pending file: ${pending.schema}`);
  process.exit(1);
}
if (pending.status !== 'pending_external_storage') {
  console.error(`[test] FAIL: Wrong status: ${pending.status}`);
  process.exit(1);
}
if (pending.procurementId !== procurementId) {
  console.error(`[test] FAIL: Wrong procurementId in pending file`);
  process.exit(1);
}
if (pending.applicationURI !== null) {
  console.error(`[test] FAIL: applicationURI should be null in fixture mode`);
  process.exit(1);
}
if (pending.readyForCommitTx !== false) {
  console.error(`[test] FAIL: readyForCommitTx should be false`);
  process.exit(1);
}
if (pending.humanReviewRequired !== true) {
  console.error(`[test] FAIL: humanReviewRequired should be true`);
  process.exit(1);
}

// 4. Read and validate report file
let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (e) {
  console.error(`[test] FAIL: Could not parse report file: ${e}`);
  process.exit(1);
}
if (report.schema !== 'emperor-os/prime-application-publication-staging-report/v1') {
  console.error(`[test] FAIL: Wrong schema in report file: ${report.schema}`);
  process.exit(1);
}
if (report.procurementId !== procurementId) {
  console.error(`[test] FAIL: Wrong procurementId in report file`);
  process.exit(1);
}
if (report.published !== false) {
  console.error(`[test] FAIL: published should be false`);
  process.exit(1);
}
if (report.fetchbackVerified !== false) {
  console.error(`[test] FAIL: fetchbackVerified should be false`);
  process.exit(1);
}
if (report.readyForCommitTx !== false) {
  console.error(`[test] FAIL: readyForCommitTx should be false`);
  process.exit(1);
}
if (report.noUnsignedTxBuilt !== true) {
  console.error(`[test] FAIL: noUnsignedTxBuilt should be true`);
  process.exit(1);
}

// 5. Check commitment material unchanged
const commitmentMaterialPath = join(baseDir, 'commitment_material.json');
if (!existsSync(commitmentMaterialPath)) {
  console.error(`[test] FAIL: Missing commitment material: ${commitmentMaterialPath}`);
  process.exit(1);
}
let commitmentMaterial;
try {
  commitmentMaterial = JSON.parse(readFileSync(commitmentMaterialPath, 'utf8'));
} catch (e) {
  console.error(`[test] FAIL: Could not parse commitment material: ${e}`);
  process.exit(1);
}
if (commitmentMaterial.applicationURI !== null) {
  console.error(`[test] FAIL: applicationURI in commitment material should be null in fixture mode`);
  process.exit(1);
}
if (commitmentMaterial.readyForCommitTx !== false) {
  console.error(`[test] FAIL: commitmentMaterial.readyForCommitTx should be false`);
  process.exit(1);
}
if (commitmentMaterial.requiresRealApplicationUri !== true) {
  console.error(`[test] FAIL: commitmentMaterial.requiresRealApplicationUri should be true`);
  process.exit(1);
}

// 6. Check no unsigned tx files were created (by checking for common patterns)
const unsignedTxPatterns = [
  'unsigned_apply_tx.json',
  'unsigned_validator_action_tx.json',
  'unsigned_commit_tx.json'
];
const fs = await import('fs');
const files = fs.readdirSync(baseDir);
for (const pattern of unsignedTxPatterns) {
  const found = files.some(f => f.includes(pattern));
  if (found) {
    console.error(`[test] FAIL: Unexpected unsigned tx file found: ${pattern}`);
    process.exit(1);
  }
}

// 7. Idempotency: run again without --force should not error
console.log('[test] Running idempotency check (second run without --force)...');
execSync(`node agent/publish_prime_application.js ${procurementId} --fixture`, { stdio: 'inherit' });

console.log('[test] PASS: All tests passed.');
process.exit(0);
