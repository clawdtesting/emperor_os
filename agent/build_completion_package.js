#!/usr/bin/env node
"use strict";

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JOB_STATUS, getJobState, setJobState } from "./state.js";
import { getJobArtifactDir, writeJson, readJson } from "./artifact-manager.js";
import { getProtocolConfig } from "./protocol-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseInputJobId(rawJobId) {
  const input = String(rawJobId ?? "").trim();
  if (!input) throw new Error("Missing jobId");
  const versioned = input.match(/^(v1|v2|prime)_(\d+)$/i);
  if (versioned) return { explicitVersion: versioned[1].toLowerCase(), numericId: versioned[2] };
  if (!/^\d+$/.test(input)) throw new Error(`Invalid jobId format: ${rawJobId}`);
  return { explicitVersion: null, numericId: input };
}

async function resolveVersionedJobId(rawJobId) {
  const { explicitVersion, numericId } = parseInputJobId(rawJobId);
  if (explicitVersion) return `${explicitVersion}_${numericId}`;
  for (const candidate of [`v1_${numericId}`, `v2_${numericId}`, `prime_${numericId}`]) {
    const state = await getJobState(candidate);
    if (state) return candidate;
  }
  throw new Error(`No state found for ${rawJobId}`);
}

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function safetySelfCheck() {
  const forbiddenChecks = [
    { label: "ethers.Wallet", regex: /ethers\s*\.\s*Wallet/ },
    { label: "sendTransaction", regex: /\bsendTransaction\s*\(/ },
    { label: "signTransaction", regex: /\bsignTransaction\s*\(/ },
    { label: "broadcast", regex: /\bbroadcast\s*\(/ },
    { label: "PRIVATE_KEY", regex: /\bPRIVATE_KEY\b/ },
    { label: "process.env.PRIVATE_KEY", regex: /process\s*\.\s*env\s*\.\s*PRIVATE_KEY/ }
  ];

  const filesToScan = [
    path.join(__dirname, "tx-builder.js"),
    path.join(__dirname, "submit.js"),
    path.join(__dirname, "reconcile-completion.js")
  ];

  for (const targetFile of filesToScan) {
    if (!(await pathExists(targetFile))) continue;
    const content = await fs.readFile(targetFile, "utf8");
    for (const check of forbiddenChecks) {
      if (check.regex.test(content)) {
        throw new Error(`[build_completion_package] SAFETY VIOLATION: '${check.label}' found in ${targetFile}`);
      }
    }
  }
  console.log("[build_completion_package] Safety self-check passed: no signing/broadcast/private-key patterns detected.");
}

async function main() {
  const jobIdArg = process.argv[2];
  const forceFlag = process.argv.includes("--force");
  if (!jobIdArg || jobIdArg === "--force") {
    console.error("Usage: node agent/build_completion_package.js <jobId> [--force]");
    process.exit(1);
  }

  await safetySelfCheck();

  const jobId = await resolveVersionedJobId(jobIdArg);
  const jobState = await getJobState(jobId);
  if (!jobState) throw new Error(`Job not found: ${jobId}`);

  const artifactDir = getJobArtifactDir(jobId);
  const completionReviewPacketPath = path.join(artifactDir, "completion_review_packet.json");
  const unsignedCompletionTxPath = path.join(artifactDir, "unsigned_completion_tx.json");

  if (!forceFlag && jobState.status === JOB_STATUS.COMPLETION_PACKAGE_READY) {
    console.log(`[build_completion_package] Idempotency skip for ${jobId}: already ${JOB_STATUS.COMPLETION_PACKAGE_READY}`);
    if (await pathExists(completionReviewPacketPath)) console.log(`[build_completion_package] Existing completion review packet: ${completionReviewPacketPath}`);
    if (await pathExists(unsignedCompletionTxPath)) console.log(`[build_completion_package] Existing unsigned completion tx: ${unsignedCompletionTxPath}`);
    process.exit(0);
  }

  const allowedBuildStates = new Set([JOB_STATUS.STORAGE_VERIFIED]);
  if (forceFlag) allowedBuildStates.add(JOB_STATUS.COMPLETION_PACKAGE_READY);

  if (!allowedBuildStates.has(jobState.status)) {
    throw new Error(`Job ${jobId} must be in '${JOB_STATUS.STORAGE_VERIFIED}'${forceFlag ? " or completion_package_ready with --force" : ""}. Current: ${jobState.status}`);
  }

  const required = [
    "job_completion.json",
    "artifact_manifest.json",
    "storage_publish_report.json",
    "ipfs_verification.json",
    "execution_review_packet.json",
    "validation_report.json"
  ];

  for (const f of required) {
    const p = path.join(artifactDir, f);
    if (!(await pathExists(p))) throw new Error(`Missing required input file: ${f}`);
  }

  if (!forceFlag && ((await pathExists(completionReviewPacketPath)) || (await pathExists(unsignedCompletionTxPath)))) {
    console.log(`[build_completion_package] Existing package detected for ${jobId}. Use --force to overwrite.`);
    console.log(`[build_completion_package] completion_review_packet.json: ${completionReviewPacketPath}`);
    console.log(`[build_completion_package] unsigned_completion_tx.json: ${unsignedCompletionTxPath}`);
    process.exit(0);
  }

  const jobCompletion = await readJson(path.join(artifactDir, "job_completion.json"));
  const artifactManifest = await readJson(path.join(artifactDir, "artifact_manifest.json"));
  const storagePublish = await readJson(path.join(artifactDir, "storage_publish_report.json"));
  const ipfsVerification = await readJson(path.join(artifactDir, "ipfs_verification.json"));
  const executionReview = await readJson(path.join(artifactDir, "execution_review_packet.json"));
  const validationReport = await readJson(path.join(artifactDir, "validation_report.json"));
  const stagingReport = await readJson(path.join(artifactDir, "storage_staging_report.json"));

  if (ipfsVerification?.ok !== true) throw new Error("ipfs_verification.json indicates fetchback not verified (ok !== true)");

  const uriState = jobState.statusMetadata?.jobCompletionUri || null;
  const uriPublish = storagePublish?.jobCompletionURI || null;
  const uriVerify = ipfsVerification?.jobCompletionURI || ipfsVerification?.ipfsUri || null;

  if (!uriState || !uriPublish || !uriVerify) throw new Error("Missing jobCompletionURI in state/publish/verification reports");
  if (!String(uriState).startsWith("ipfs://") || !String(uriPublish).startsWith("ipfs://") || !String(uriVerify).startsWith("ipfs://")) {
    throw new Error("jobCompletionURI must begin with ipfs:// in all sources");
  }
  if (!(uriState === uriPublish && uriPublish === uriVerify)) {
    throw new Error(`jobCompletionURI mismatch: state='${uriState}' publish='${uriPublish}' verification='${uriVerify}'`);
  }

  if (stagingReport?.artifactManifestVerified !== true && jobState.statusMetadata?.artifactManifestVerified !== true) {
    throw new Error("Artifact manifest verification was not confirmed as successful");
  }

  const protocol = String(jobState.contractVersion || jobCompletion?.protocol || "unknown").toLowerCase();
  let protocolConfig = null;
  try {
    protocolConfig = getProtocolConfig(protocol);
  } catch {
    protocolConfig = null;
  }

  const contractAddress = protocolConfig?.contractAddress || jobState.rawJob?.jobManager || jobState.rawJob?.contractAddress || "unknown";
  const chainId = protocolConfig?.chainId || jobState.rawJob?.chainId || "unknown";
  const completionAction = protocolConfig?.supportedActions?.completion || null;
  const method = completionAction?.method || "needs_abi_confirmation";
  const methodVerified = completionAction?.methodStatus === "verified_from_local_abi";

  const unsignedCompletionTx = {
    schema: "emperor-os/unsigned-tx/v1",
    kind: "completion",
    humanReviewRequired: true,
    dryRun: false,
    jobId,
    protocol,
    contractAddress,
    chainId: String(chainId),
    method,
    args: [],
    value: "0",
    jobCompletionURI: uriState,
    createdAt: new Date().toISOString(),
    sourceArtifacts: {
      jobCompletion: "job_completion.json",
      artifactManifest: "artifact_manifest.json",
      storagePublishReport: "storage_publish_report.json",
      ipfsVerification: "ipfs_verification.json",
      validationReport: "validation_report.json"
    },
    calldataStatus: methodVerified ? "abi_verified_function_signature_only" : "needs_contract_abi_confirmation",
    executableAsIs: false,
    requiresAbiVerification: !methodVerified,
    safety: {
      agentSigned: false,
      agentBroadcast: false,
      privateKeyUsed: false,
      requiresExternalWallet: true,
      nonceManagedByEmperorOS: false
    },
    operatorInstructions: [
      "Review completion artifacts.",
      "Verify the jobCompletionURI fetchback report.",
      "Independently verify contract method and calldata before external signing.",
      "Sign and broadcast only outside Emperor OS."
    ]
  };

  const completionReviewPacket = {
    schema: "emperor-os/completion-review-packet/v1",
    jobId,
    createdAt: new Date().toISOString(),
    protocol,
    payout: jobState.payout ?? null,
    jobSummary: {
      title: jobState.title || null,
      category: jobState.category || null,
      status: jobState.status,
      executionMode: jobState.executionMode || executionReview?.executionMode || null
    },
    validation: {
      passed: validationReport?.passed === true,
      reportPath: "validation_report.json"
    },
    storageVerification: {
      localArtifactManifestVerified: stagingReport?.artifactManifestVerified === true || jobState.statusMetadata?.artifactManifestVerified === true,
      externalStoragePublished: true,
      fetchbackVerified: ipfsVerification?.ok === true,
      jobCompletionURI: uriState,
      publishReportPath: "storage_publish_report.json",
      ipfsVerificationPath: "ipfs_verification.json"
    },
    artifactManifestPath: "artifact_manifest.json",
    unsignedCompletionTxPath: "unsigned_completion_tx.json",
    checklist: [
      "Confirm on-chain job status still eligible for completion request.",
      "Review validation and execution artifacts.",
      "Confirm jobCompletionURI and fetchback verification reports.",
      "Verify ABI/function signature and calldata externally before signing.",
      "Sign/broadcast only outside Emperor OS."
    ],
    warnings: [
      "No transaction signed by Emperor OS.",
      "No transaction broadcast by Emperor OS.",
      "No nonce managed by Emperor OS.",
      "No private key used by Emperor OS.",
      "Human must re-check on-chain job status before external signing."
    ],
    humanReviewRequired: true
  };

  await writeJson(unsignedCompletionTxPath, unsignedCompletionTx);
  await writeJson(completionReviewPacketPath, completionReviewPacket);

  const updated = await setJobState(jobId, {
    status: JOB_STATUS.COMPLETION_PACKAGE_READY,
    completionPackageBuiltAt: new Date().toISOString(),
    statusMetadata: {
      ...(jobState.statusMetadata || {}),
      txPackageBuilt: true,
      signed: false,
      broadcast: false,
      requiresHumanSigning: true,
      jobCompletionUri: uriState
    },
    completionPackage: {
      completionReviewPacketPath,
      unsignedCompletionTxPath
    },
    attempts: {
      ...jobState.attempts,
      completionPackage: (jobState.attempts?.completionPackage || 0) + 1
    }
  });

  console.log(`[build_completion_package] Job ${jobId} state transition: ${jobState.status} → ${updated.status}`);
  console.log(`[build_completion_package] Wrote completion review packet: ${completionReviewPacketPath}`);
  console.log(`[build_completion_package] Wrote unsigned completion tx: ${unsignedCompletionTxPath}`);
  console.log(`[build_completion_package] ABI/calldata status: ${unsignedCompletionTx.calldataStatus}`);
  console.log("[build_completion_package] No signing, no broadcasting, no private key usage.");
}

main().catch((err) => {
  console.error("[build_completion_package] Fatal error:", err.message || err);
  process.exit(1);
});
