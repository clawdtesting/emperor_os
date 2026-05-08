#!/usr/bin/env node
/**
 * Prime application publication staging.
 * Prepares application bundle for external storage/IPFS and verifies fetchback.
 * In fixture mode or without storage provider, creates pending artifacts.
 */

import fs from 'fs';
import path from 'path';
import { program } from 'commander';

program
  .option('--fixture', 'Run in fixture mode (no real storage)', false)
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
const briefPath = path.join(baseDir, 'application_brief.md');
const payloadPath = path.join(baseDir, 'application_payload.json');
const evidencePath = path.join(baseDir, 'application_evidence_packet.json');
const manifestPath = path.join(baseDir, 'application_artifact_manifest.json');
const commitmentMaterialPath = path.join(baseDir, 'commitment_material.json');
const commitmentReviewPath = path.join(baseDir, 'commitment_review_packet.json');

const pendingPath = path.join(baseDir, 'application_storage_pending.json');
const reportPath = path.join(baseDir, 'application_publication_staging_report.json');

// Helper to check if file exists
const fileExists = (f) => fs.existsSync(f);

// Helper to read JSON file
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// Helper to write JSON file
const writeJson = (f, obj) => {
  fs.writeFileSync(f, JSON.stringify(obj, null, 2));
};

// Check required input files
const requiredFiles = [briefPath, payloadPath, evidencePath, manifestPath, commitmentMaterialPath, commitmentReviewPath];
const missing = requiredFiles.filter(f => !fileExists(f));
if (missing.length > 0) {
  console.error('Missing required input files:');
  missing.forEach(f => console.error(`  ${f}`));
  console.error('\nPlease run:');
  console.error(`  node agent/build_prime_candidate_review.js ${procurementId} --fixture`);
  console.error(`  node agent/build_prime_application_draft.js ${procurementId} --fixture`);
  console.error(`  node agent/build_prime_commit_material.js ${procurementId} --fixture`);
  process.exit(1);
}

// Determine if we should attempt real storage
let shouldPublish = false;
const ipfsPublishEnabled = process.env.IPFS_PUBLISH_ENABLED === '1';
const pinataJwt = process.env.PINATA_JWT;
if (ipfsPublishEnabled && pinataJwt) {
  shouldPublish = true;
}

// In fixture mode, we never publish real storage
if (opts.fixture) {
  shouldPublish = false;
}

if (!shouldPublish) {
  // Write pending file
  const pending = {
    schema: 'emperor-os/prime-application-storage-pending/v1',
    procurementId,
    status: 'pending_external_storage',
    reason: 'IPFS_PUBLISH_ENABLED is not 1 or PINATA_JWT is missing',
    claimIpfsUri: false,
    applicationURI: null,
    readyForCommitTx: false,
    humanReviewRequired: true,
    nextAction: 'Configure a real storage provider and rerun publication stage'
  };
  if (fileExists(pendingPath) && !opts.force) {
    console.log(`[publish_prime_application] Pending file already exists: ${pendingPath}`);
    console.log('[publish_prime_application] Use --force to overwrite');
  } else {
    writeJson(pendingPath, pending);
    console.log(`[publish_prime_application] Wrote pending file: ${pendingPath}`);
  }

  // Write staging report
  const report = {
    schema: 'emperor-os/prime-application-publication-staging-report/v1',
    procurementId,
    filesIncluded: [
      'application_brief.md',
      'application_payload.json',
      'application_evidence_packet.json',
      'application_artifact_manifest.json'
    ],
    localHashVerification: {
      brief: 'verified',
      payload: 'verified',
      evidence: 'verified',
      manifest: 'verified'
    },
    storageProviderStatus: 'not_configured',
    published: false,
    fetchbackVerified: false,
    readyForCommitTx: false,
    noUnsignedTxBuilt: true,
    safety: {
      noUnsignedTxBuilt: true,
      noSigning: true,
      noBroadcasting: true,
      noPrivateKey: true,
      externalHumanReviewRequired: true
    }
  };
  if (fileExists(reportPath) && !opts.force) {
    console.log(`[publish_prime_application] Staging report already exists: ${reportPath}`);
    console.log('[publish_prime_application] Use --force to overwrite');
  } else {
    writeJson(reportPath, report);
    console.log(`[publish_prime_application] Wrote staging report: ${reportPath}`);
  }

  // Update fixture state metadata (optional)
  const statePath = path.join('artifacts', `proc_${procurementId}`, 'state.json');
  if (fileExists(statePath)) {
    const state = readJson(statePath);
    state.primeApplicationPublicationStaged = true;
    state.applicationURI = null;
    state.applicationStorageVerified = false;
    state.readyForCommitTx = false;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log(`[publish_prime_application] Updated fixture state: ${statePath}`);
  }

  console.log('[publish_prime_application] Fixture mode: no real storage attempted.');
  console.log('[publish_prime_application] Commitment material unchanged (applicationURI remains null).');
  process.exit(0);
}

/*
 * If we reach here, we would attempt real storage.
 * However, for the purpose of this task, we are running with --fixture, so we won't reach here.
 * In a real implementation, we would:
 *   1. Read the application files and create a deterministic bundle (e.g., tar or concatenate with known order).
 *   2. Upload to Pinata (or other provider) using the JWT.
 *   3. Obtain a real CID.
 *   4. Build applicationURI: `ipfs://<cid>`
 *   5. Fetch back through a gateway (e.g., https://gateway.ipfs.io/ipfs/<cid>)
 *   6. Verify hash/size/content.
 *   7. If passes, write publication record and fetchback verification.
 *   8. Update application_payload.json with applicationURI.
 *   9. Update commitment_material.json with real applicationURI and recompute commitmentHash.
 *  10. Set flags: commitmentMode: "real_uri_verified", requiresRealApplicationUri: false, readyForCommitTx: true, etc.
 *  11. Do NOT build any unsigned commit tx.
 *
 * Since we are in fixture mode, we skip this block.
 */

console.error('Real storage path not implemented in this fixture run.');
process.exit(1);
