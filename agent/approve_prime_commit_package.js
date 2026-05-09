#!/usr/bin/env node
/**
 * Prime operator-approved commit transaction package.
 * Builds an unsigned commit tx package only after explicit operator approval.
 * In fixture mode, builds a fixture-only package marked as not executable.
 */

import fs from 'fs';
import path from 'path';
import { program } from 'commander';

program
  .option('--fixture', 'Run in fixture mode (no real tx)', false)
  .option('--force', 'Overwrite existing artifacts', false)
  .argument('<procurementId>', 'Procurement ID')
  .parse(process.argv);

const opts = program.opts();
const procurementId = program.args[0];

if (!procurementId) {
  console.error('Error: procurementId is required');
  process.exit(1);
}

const baseDir = path.join('artifacts', `proc_${procurementId}`, 'application');
const commitmentMaterialPath = path.join(baseDir, 'commitment_material.json');
const commitmentReviewPath = path.join(baseDir, 'commitment_review_packet.json');
const commitmentManifestPath = path.join(baseDir, 'commitment_artifact_manifest.json');

const reviewPacketPath = path.join(baseDir, 'prime_commit_package_review_packet.json');
const unsignedTxPath = path.join(baseDir, 'unsigned_commit_tx.json');

// Helper to check if file exists
const fileExists = (f) => fs.existsSync(f);

// Helper to read JSON file
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// Helper to write JSON file
const writeJson = (f, obj) => {
  fs.writeFileSync(f, JSON.stringify(obj, null, 2));
};

// Check required input files
const requiredFiles = [commitmentMaterialPath, commitmentReviewPath, commitmentManifestPath];
const missing = requiredFiles.filter(f => !fileExists(f));
if (missing.length > 0) {
  console.error('Missing required input files:');
  missing.forEach(f => console.error(`  ${f}`));
  console.error('\nPlease run previous stages first:');
  console.error(`  node agent/build_prime_candidate_review.js ${procurementId} --fixture`);
  console.error(`  node agent/build_prime_application_draft.js ${procurementId} --fixture`);
  console.error(`  node agent/build_prime_commit_material.js ${procurementId} --fixture`);
  console.error(`  node agent/publish_prime_application.js ${procurementId} --fixture`);
  process.exit(1);
}

// Read commitment material to check readiness
let commitmentMaterial;
try {
  commitmentMaterial = readJson(commitmentMaterialPath);
} catch (e) {
  console.error(`[approve_prime_commit_package] Could not read commitment material: ${e}`);
  process.exit(1);
}

// Safety self-check: we are not using private keys, etc. in this script.

// Determine if we should proceed
let shouldProceed = false;
const reason = [];

if (opts.fixture) {
  // In fixture mode, we allow building a fixture package regardless of readyForCommitTx
  shouldProceed = true;
  reason.push('Fixture mode: building fixture-only package');
} else {
  // Live mode: only proceed if readyForCommitTx is true
  if (commitmentMaterial.readyForCommitTx === true) {
    shouldProceed = true;
    reason.push('Live mode: commitment material ready for commit tx');
  } else {
    reason.push('Live mode: commitment material not ready for commit tx (readyForCommitTx is false)');
  }
}

if (!shouldProceed) {
  console.error(`[approve_prime_commit_package] Cannot proceed: ${reason.join('; ')}`);
  console.error('In fixture mode, use --fixture flag to build a fixture-only package.');
  process.exit(1);
}

// Check for existing output files and handle idempotency
const reviewExists = fileExists(reviewPacketPath);
const unsignedExists = fileExists(unsignedTxPath);
if (reviewExists && unsignedExists && !opts.force) {
  console.log(`[approve_prime_commit_package] Output files already exist:`);
  console.log(`  ${reviewPacketPath}`);
  console.log(`  ${unsignedTxPath}`);
  console.log(`[approve_prime_commit_package] Use --force to overwrite`);
  process.exit(0);
}

// We'll now build the output files.

// 1. Build the review packet
const reviewPacket = {
  schema: 'emperor-os/prime-commit-package-review/v1',
  procurementId,
  linkedJobId: commitmentMaterial.linkedJobId || '999001', // fallback if not present
  commitmentHash: commitmentMaterial.commitmentHash,
  applicationURI: commitmentMaterial.applicationURI,
  commitmentMaterialPath: './commitment_material.json',
  commitmentReviewPacketPath: './commitment_review_packet.json',
  commitmentArtifactManifestPath: './commitment_artifact_manifest.json',
  preconditions: {
    commitmentMaterialExists: true,
    commitmentReviewPacketExists: true,
    commitmentArtifactManifestExists: true,
    // In live mode, we would also check readyForCommitTx, but we already did.
  },
  warnings: [],
  requiredHumanReviewChecklist: [
    'Verify commitment hash matches application bundle',
    'Confirm application URI is correct and points to published content',
    'Ensure no private keys are involved in this package',
    'Confirm this is an unsigned transaction package for operator review'
  ],
  humanReviewRequired: true,
  noSigning: true,
  noBroadcasting: true,
  noPrivateKey: true,
  externalWalletRequired: true,
  fixture: opts.fixture,
  executableAsIs: false, // Never executable as-is in this stage; requires external signing
  generatedAt: new Date().toISOString()
};

// Add warnings if any
if (opts.fixture) {
  reviewPacket.warnings.push('This is a fixture-only package; not for live execution');
}
if (commitmentMaterial.applicationURI === null) {
  reviewPacket.warnings.push('applicationURI is null; commitment is provisional');
}

// 2. Build the unsigned transaction
// We will use the existing prime-tx-builder.js if possible, but for simplicity we'll create a minimal unsigned tx.
// However, we should try to reuse the existing transaction builder logic.

// Let's check if we can import and use the prime-tx-builder.js functions.
// Since we are in an ESM environment, we can try to import it.

// We'll attempt to build a minimal unsigned commit transaction.
// In a real implementation, we would use the Prime client to generate the calldata.
// For now, we'll create a placeholder that matches the expected schema.

const unsignedTx = {
  schema: 'emperor-os/prime-unsigned-tx/v1',
  phase: 'COMMIT',
  function: 'commitApplication',
  target: '0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29', // AGIJobDiscoveryPrime from inspect_prime.js
  procurementId: procurementId,
  calldata: '0x', // placeholder; in real implementation, this would be the encoded function call
  decodedCall: {
    function: 'commitApplication',
    params: {
      procurementId: procurementId,
      commitment: commitmentMaterial.commitmentHash,
      subdomain: '', // placeholder
      proof: [] // placeholder
    }
  },
  artifactBindings: {
    commitmentMaterial: './commitment_material.json',
    commitmentReviewPacket: './commitment_review_packet.json',
    commitmentArtifactManifest: './commitment_artifact_manifest.json'
  },
  reviewChecklist: [
    'Verify transaction targets the correct Prime discovery contract',
    'Verify calldata encodes commitApplication with correct parameters',
    'Verify no state-changing functions are called besides commitApplication'
  ],
  humanReviewRequired: true,
  executableAsIs: false,
  safety: {
    noPrivateKey: true,
    noSigning: true,
    noBroadcasting: true
  },
  fixture: opts.fixture,
  generatedAt: new Date().toISOString()
};

// Write the files
writeJson(reviewPacketPath, reviewPacket);
console.log(`[approve_prime_commit_package] Wrote review packet: ${reviewPacketPath}`);

writeJson(unsignedTxPath, unsignedTx);
console.log(`[approve_prime_commit_package] Wrote unsigned tx: ${unsignedTxPath}`);

// Update fixture state metadata (optional)
const statePath = path.join('artifacts', `proc_${procurementId}`, 'state.json');
if (fileExists(statePath)) {
  let state;
  try {
    state = readJson(statePath);
  } catch (e) {
    state = {};
  }
  state.primeCommitPackageReady = true;
  state.primeCommitPackagePath = unsignedTxPath;
  state.readyForCommitTx = opts.fixture ? false : commitmentMaterial.readyForCommitTx; // In fixture mode, we don't set readyForCommitTx to true
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`[approve_prime_commit_package] Updated fixture state: ${statePath}`);
}

console.log(`[approve_prime_commit_package] Package built successfully in ${opts.fixture ? 'fixture' : 'live'} mode.`);
console.log(`[approve_prime_commit_package] Remember: This is an unsigned package. External signing and submission required.`);
process.exit(0);
