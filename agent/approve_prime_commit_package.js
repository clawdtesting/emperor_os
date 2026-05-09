#!/usr/bin/env node
/**
 * Prime operator-approved commit transaction package hardening.
 * Builds unsigned commit tx package only after explicit operator approval.
 * Uses buildCommitApplicationTx from prime-tx-builder.js and fails closed on invalid inputs.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { program } from 'commander';
import { buildCommitApplicationTx } from './prime-tx-builder.js';

program
  .option('--fixture', 'Run in fixture mode (no real tx submit)', false)
  .option('--force', 'Overwrite existing artifacts', false)
  .argument('<procurementId>', 'Procurement ID')
  .parse(process.argv);

const opts = program.opts();
const procurementIdArg = program.args[0];

if (!procurementIdArg) {
  console.error('[approve_prime_commit_package] Error: procurementId is required');
  process.exit(1);
}

const procId = String(procurementIdArg);
const baseDir = path.join('artifacts', `proc_${procId}`, 'application');
const commitmentMaterialPath = path.join(baseDir, 'commitment_material.json');
const commitmentReviewPath = path.join(baseDir, 'commitment_review_packet.json');
const commitmentManifestPath = path.join(baseDir, 'commitment_artifact_manifest.json');
const reviewPacketPath = path.join(baseDir, 'prime_commit_package_review_packet.json');
const unsignedTxPath = path.join(baseDir, 'unsigned_commit_tx.json');

const REQUIRED_INPUTS = [
  commitmentMaterialPath,
  commitmentReviewPath,
  commitmentManifestPath,
];

const SAFETY_PATTERNS = [
  /\bethers\.Wallet\s*\(/,
  /\bsendTransaction\s*\(/,
  /\bsignTransaction\s*\(/,
  /\bbroadcast(Transaction)?\s*\(/,
  /\bprocess\.env\.PRIVATE_KEY\b/,
  /\bPRIVATE_KEY\s*[:=]/,
];

const SAFETY_SCAN_FILES = [
  path.join('agent', 'approve_prime_commit_package.js'),
  path.join('agent', 'prime-tx-builder.js'),
];

function fileExists(p) {
  return fs.existsSync(p);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function sha256HexUtf8(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function fail(msg, extra = []) {
  console.error(`[approve_prime_commit_package] ${msg}`);
  for (const line of extra) console.error(line);
  process.exit(1);
}

function isPlaceholderUnsignedTx(pkg) {
  if (!pkg || typeof pkg !== 'object') return true;
  const calldata = pkg.calldata;
  const args = pkg.args && typeof pkg.args === 'object' ? pkg.args : {};
  const subdomain = args.subdomain;
  const proof = args.proof;

  if (calldata === '0x') return true;
  if (typeof subdomain === 'string' && subdomain.trim() === '') return true;
  if (Array.isArray(proof) && proof.length === 0) return true;
  return false;
}

function validateRequiredInputFiles() {
  const missing = REQUIRED_INPUTS.filter((p) => !fileExists(p));
  if (missing.length) {
    fail('Missing required input files.', [
      ...missing.map((m) => `  - ${m}`),
      '',
      'Required predecessor stages:',
      `  node agent/build_prime_candidate_review.js ${procId} --fixture --force`,
      `  node agent/build_prime_application_draft.js ${procId} --fixture --force`,
      `  node agent/build_prime_commit_material.js ${procId} --fixture --force`,
      `  node agent/publish_prime_application.js ${procId} --fixture --force`,
    ]);
  }
}

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/`(?:\\.|[^`])*`/g, ' ')
    .replace(/"(?:\\.|[^"])*"/g, ' ')
    .replace(/'(?:\\.|[^'])*'/g, ' ');
}

function validateSafetySelfCheck() {
  const findings = [];
  for (const relFile of SAFETY_SCAN_FILES) {
    if (!fileExists(relFile)) continue;
    const raw = fs.readFileSync(relFile, 'utf8');
    const content = stripCommentsAndStrings(raw);
    for (const pattern of SAFETY_PATTERNS) {
      if (pattern.test(content)) {
        findings.push(`${relFile}: matched forbidden pattern ${pattern}`);
      }
    }
  }
  if (findings.length) {
    fail('Safety self-check failed. Forbidden signing/broadcast/private-key patterns detected.', findings);
  }
}

function extractRequiredFields(material) {
  const procurementId = material?.procurementId;
  const commitmentHash = material?.commitmentHash;
  const salt = material?.salt;
  const subdomain = material?.agentSubdomain ?? material?.subdomain;
  const proof = material?.merkleProof ?? material?.proof;

  const missing = [];
  if (procurementId == null || String(procurementId).trim() === '') missing.push('procurementId');
  if (!commitmentHash || typeof commitmentHash !== 'string') missing.push('commitmentHash');
  if (!salt || typeof salt !== 'string') missing.push('salt');
  if (subdomain == null || String(subdomain).trim() === '') missing.push('agentSubdomain|subdomain');
  if (!Array.isArray(proof) || proof.length === 0) missing.push('merkleProof|proof');

  if (missing.length) {
    const stageHint = [];
    if (missing.includes('agentSubdomain|subdomain') || missing.includes('merkleProof|proof')) {
      stageHint.push('Subdomain/proof must be produced by commitment material stage.');
      stageHint.push(`Run: node agent/build_prime_commit_material.js ${procId} --fixture --force`);
    }
    fail(`commitment_material.json missing required fields: ${missing.join(', ')}`, stageHint);
  }

  return {
    procurementId: String(procurementId),
    commitmentHash,
    salt,
    subdomain: String(subdomain),
    proof,
    applicationURI: material?.applicationURI ?? null,
    readyForCommitTx: material?.readyForCommitTx === true,
    fixture: material?.fixture === true,
    nonExecutableAsIs: material?.executableAsIs === false,
    requiresRealApplicationUri: material?.requiresRealApplicationUri === true,
    humanReviewRequired: material?.humanReviewRequired === true,
    linkedJobId: material?.linkedJobId,
    commitmentMode: material?.commitmentMode ?? null,
  };
}

function validateApplicationUriGate(fields) {
  if (!opts.fixture) {
    if (!fields.readyForCommitTx) {
      fail('Live/default mode blocked: readyForCommitTx is false.');
    }
    if (fields.applicationURI == null) {
      fail('Live/default mode blocked: applicationURI is null. Publish real application URI first.');
    }
    return;
  }

  if (fields.applicationURI == null) {
    const allowedFixturePacket = (
      fields.fixture === true &&
      fields.nonExecutableAsIs === true &&
      fields.requiresRealApplicationUri === true &&
      fields.humanReviewRequired === true
    );
    if (!allowedFixturePacket) {
      fail('Fixture mode blocked: provisional package flags are not all set (fixture=true, executableAsIs=false, requiresRealApplicationUri=true, humanReviewRequired=true).');
    }
  }
}

function validateIdempotency() {
  const reviewExists = fileExists(reviewPacketPath);
  const unsignedExists = fileExists(unsignedTxPath);
  if (!(reviewExists && unsignedExists)) return;

  let existing;
  try {
    existing = readJson(unsignedTxPath);
  } catch (err) {
    fail(`Unable to parse existing unsigned tx at ${unsignedTxPath}: ${err.message}`);
  }

  const placeholder = isPlaceholderUnsignedTx(existing);
  if (placeholder && !opts.force) {
    fail('Existing unsigned tx is placeholder/invalid. Refusing silent acceptance; rerun with --force to regenerate.');
  }

  if (!opts.force) {
    console.log('[approve_prime_commit_package] Outputs already exist and pass placeholder guard. Use --force to regenerate.');
    process.exit(0);
  }
}

function validateBuiltCalldata(pkg) {
  const calldata = pkg?.calldata;
  if (typeof calldata !== 'string') {
    fail('Builder output invalid: calldata is not a string.');
  }
  if (!calldata.startsWith('0x')) {
    fail('Builder output invalid: calldata does not start with 0x.');
  }
  if (calldata === '0x' || calldata.length <= 10) {
    fail('Builder output invalid: calldata is empty/placeholder.');
  }

  const fn = pkg?.function;
  const decoded = pkg?.decodedCall;
  if (fn !== 'commitApplication') {
    fail(`Builder output invalid: function is not commitApplication (got: ${String(fn)}).`);
  }
  if (!decoded || String(decoded).includes('commitApplication') === false) {
    fail('Builder output invalid: decoded call does not indicate commitApplication.');
  }

  const builtSubdomain = pkg?.args?.subdomain;
  const builtProof = pkg?.args?.proof;
  if (typeof builtSubdomain !== 'string' || builtSubdomain.trim() === '') {
    fail('Builder output invalid: subdomain is empty.');
  }
  if (!Array.isArray(builtProof)) {
    fail('Builder output invalid: proof is not an array.');
  }
}

async function main() {
  validateSafetySelfCheck();
  validateRequiredInputFiles();
  validateIdempotency();

  let commitmentMaterial;
  try {
    commitmentMaterial = readJson(commitmentMaterialPath);
  } catch (err) {
    fail(`Could not read commitment material: ${err.message}`);
  }

  const fields = extractRequiredFields(commitmentMaterial);
  validateApplicationUriGate(fields);

  let builderResult;
  try {
    builderResult = await buildCommitApplicationTx({
      procurementId: fields.procurementId,
      linkedJobId: fields.linkedJobId,
      commitment: fields.commitmentHash,
      subdomain: fields.subdomain,
      merkleProof: fields.proof,
      applicationArtifactPath: path.join(baseDir, 'application_payload.json'),
    });
  } catch (err) {
    fail(`Failed to build commit tx package: ${err.message}`);
  }

  if (!builderResult?.package || !builderResult?.path) {
    fail('Builder returned malformed result (missing package/path).');
  }

  validateBuiltCalldata(builderResult.package);

  if (!fileExists(builderResult.path)) {
    fail(`Builder reported output path but file is missing: ${builderResult.path}`);
  }

  const applicationUriStatus = fields.applicationURI == null ? 'null/provisional' : 'present';
  const calldataHash = sha256HexUtf8(builderResult.package.calldata);

  const reviewPacket = {
    schema: 'emperor-os/prime-commit-package-review/v1',
    procurementId: fields.procurementId,
    linkedJobId: fields.linkedJobId ?? null,
    commitmentHash: fields.commitmentHash,
    packagePath: path.relative(baseDir, builderResult.path),
    unsignedTxPath: path.relative(baseDir, unsignedTxPath),
    calldataHash,
    subdomain: fields.subdomain,
    proofLength: fields.proof.length,
    applicationURI: fields.applicationURI,
    applicationURIStatus: applicationUriStatus,
    fixture: !!opts.fixture,
    commitmentMode: fields.commitmentMode,
    warnings: [],
    humanReviewChecklist: [
      'Verify decoded function is commitApplication and calldata selector matches ABI',
      'Verify procurementId and commitmentHash match commitment_material.json',
      'Verify subdomain is correct and non-empty',
      'Verify proof array and proof length match commitment material',
      'Verify target contract and chainId before external signing',
      'Do not sign/broadcast from this runtime',
    ],
    safety: {
      noPrivateKeyInRuntime: true,
      noSigningInRuntime: true,
      noBroadcastInRuntime: true,
      humanReviewRequired: true,
      executableAsIs: false,
      requiresRealApplicationUri: fields.applicationURI == null,
    },
    builderOutput: {
      function: builderResult.package.function,
      decodedCall: builderResult.package.decodedCall,
      calldataLength: builderResult.package.calldata.length,
    },
    generatedAt: new Date().toISOString(),
  };

  if (opts.fixture) {
    reviewPacket.warnings.push('Fixture mode build: unsigned package is non-executable as-is.');
  }
  if (fields.applicationURI == null) {
    reviewPacket.warnings.push('applicationURI is null: provisional only, requires real URI before live use.');
  }
  if (fields.commitmentMode && String(fields.commitmentMode).includes('fixture')) {
    reviewPacket.warnings.push(`commitmentMode=${fields.commitmentMode}`);
  }

  writeJson(reviewPacketPath, reviewPacket);

  console.log(`[approve_prime_commit_package] Wrote unsigned tx: ${builderResult.path}`);
  console.log(`[approve_prime_commit_package] Wrote review packet: ${reviewPacketPath}`);
  console.log(`[approve_prime_commit_package] calldata validated: hash=${calldataHash}, function=${builderResult.package.function}`);
  console.log('[approve_prime_commit_package] Safety boundary maintained: unsigned package only, no signing/broadcasting/private-key usage.');
}

main().catch((err) => {
  fail(`Unexpected error: ${err.message}`);
});
