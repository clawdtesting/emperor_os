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

// Job ID resolution functions (copied from approve_for_apply.js)
function parseInputJobId(rawJobId) {
  const input = String(rawJobId ?? "").trim();
  if (!input) throw new Error("Missing jobId");

  const versioned = input.match(/^(v1|v2|prime)_(\d+)$/i);
  if (versioned) {
    return { explicitVersion: versioned[1].toLowerCase(), numericId: versioned[2] };
  }

  if (!/^\d+$/.test(input)) {
    throw new Error(`Invalid jobId format: ${rawJobId}. Expected <numeric> or <v1|v2|prime>_<numeric>.`);
  }

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
        throw new Error(`[build_validator_action_package] SAFETY VIOLATION: '${check.label}' found in ${targetFile}`);
      }
    }
  }
  console.log("[build_validator_action_package] Safety self-check passed: no signing/broadcast/private-key patterns detected.");
}

async function main() {
  const jobIdArg = process.argv[2];
  const forceFlag = process.argv.includes("--force");
  if (!jobIdArg || jobIdArg === "--force") {
    console.error("Usage: node agent/build_validator_action_package.js <jobId> [--force]");
    process.exit(1);
  }

  await safetySelfCheck();

  const jobId = await resolveVersionedJobId(jobIdArg);
  const jobState = await getJobState(jobId);
  if (!jobState) throw new Error(`Job not found: ${jobId}`);

  const artifactDir = getJobArtifactDir(jobId);
  const validatorActionReviewPacketPath = path.join(artifactDir, "validator_action_review_packet.json");
  const unsignedValidatorActionTxPath = path.join(artifactDir, "unsigned_validator_action_tx.json");

  // Idempotency check
  if (!forceFlag && await pathExists(validatorActionReviewPacketPath) && await pathExists(unsignedValidatorActionTxPath)) {
    console.log(`[build_validator_action_package] Idempotency skip for ${jobId}: validator action package already exists.`);
    console.log(`[build_validator_action_package] Existing validator action review packet: ${validatorActionReviewPacketPath}`);
    console.log(`[build_validator_action_package] Existing unsigned validator action tx: ${unsignedValidatorActionTxPath}`);
    process.exit(0);
  }

  // Required prerequisite: validator_report.json and validator_review_packet.json
  const requiredInputs = [
    "validator_report.json",
    "validator_review_packet.json"
  ];

  for (const f of requiredInputs) {
    const p = path.join(artifactDir, f);
    if (!(await pathExists(p))) throw new Error(`Missing required input file: ${f}`);
  }

  // Read validator report to check recommended action
  const validatorReport = await readJson(path.join(artifactDir, "validator_report.json"));
  if (!validatorReport) throw new Error(`Failed to read validator_report.json`);

  const recommendedAction = validatorReport.recommendedValidatorAction;
  const allowedActions = ["approve_candidate", "reject_candidate", "needs_human_review"];
  if (!allowedActions.includes(recommendedAction)) {
    throw new Error(`Invalid recommendedValidatorAction: ${recommendedAction}. Must be one of: ${allowedActions.join(", ")}`);
  }

  // Additional validation: check artifact integrity and storage verification
  if (!validatorReport.artifactIntegrityChecks?.ok) {
    throw new Error("Artifact integrity check failed in validator report");
  }
  if (!validatorReport.storageVerificationChecks?.ipfsVerified) {
    throw new Error("Storage verification failed in validator report");
  }

  // Check for job completion package and URI
  const completionReviewPacketPath = path.join(artifactDir, "completion_review_packet.json");
  if (!(await pathExists(completionReviewPacketPath))) {
    throw new Error("Completion review packet missing");
  }

  const completionReviewPacket = await readJson(completionReviewPacketPath);
  if (!completionReviewPacket) throw new Error("Failed to read completion_review_packet.json");

  const jobCompletionURI = completionReviewPacket.jobCompletionURI || validatorReport.bundleUri;
  if (!jobCompletionURI || !jobCompletionURI.startsWith("ipfs://")) {
    throw new Error("Missing or invalid jobCompletionURI");
  }

  // Get protocol config for contract address and method
  const protocol = String(jobState.contractVersion || validatorReport.protocol || "v1").toLowerCase();
  let protocolConfig = null;
  try {
    protocolConfig = getProtocolConfig(protocol);
  } catch (err) {
    // Fallback to v1 if protocol not found
    protocolConfig = getProtocolConfig("v1");
  }

  const contractAddress = protocolConfig.contractAddress || "unknown";
  const chainId = String(protocolConfig.chainId || "unknown");
  const validationAction = protocolConfig.supportedActions?.validation;
  const method = validationAction?.method || "getJobValidation";
  const methodVerified = validationAction?.methodStatus === "verified_from_local_abi";

  // Build unsigned validator action tx
  const unsignedValidatorActionTx = {
    schema: "emperor-os/unsigned-tx/v1",
    kind: "validator_action",
    humanReviewRequired: true,
    dryRun: false,
    jobId,
    protocol,
    contractAddress,
    chainId,
    method,
    args: [], // Args would be [jobId] for getJobValidation, but we'll leave empty for operator to fill
    value: "0",
    recommendedValidatorAction: recommendedAction,
    jobCompletionURI,
    validatorReportPath: "validator_report.json",
    createdAt: new Date().toISOString(),
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
      "Review validator report.",
      "Review completion evidence and IPFS fetchback verification.",
      "Independently verify validator contract method and calldata before external signing.",
      "Sign and broadcast only outside Emperor OS."
    ]
  };

  // Build validator action review packet
  const validatorActionReviewPacket = {
    schema: "emperor-os/validator-action-review-packet/v1",
    jobId,
    protocol,
    recommendedValidatorAction: recommendedAction,
    scoreBreakdown: validatorReport.scoreBreakdown,
    reasons: validatorReport.reasons || [],
    validatorReportPath: "validator_report.json",
    completionReviewPacketPath: "completion_review_packet.json",
    jobCompletionURI,
    unsignedValidatorActionTxPath: "unsigned_validator_action_tx.json",
    checklist: [
      "Confirm on-chain job status is still eligible for validator action.",
      "Review validator report and score breakdown.",
      "Verify completion evidence and IPFS fetchback verification reports.",
      "Independently verify validator contract method and calldata before external signing.",
      "Sign/broadcast only outside Emperor OS."
    ],
    warnings: [
      "No on-chain validation submitted.",
      "No validator approval/rejection signed.",
      "No broadcast performed.",
      "No private key used.",
      "Human must independently review before any external validator action."
    ],
    humanReviewRequired: true
  };

  // Write the files
  await writeJson(unsignedValidatorActionTxPath, unsignedValidatorActionTx);
  await writeJson(validatorActionReviewPacketPath, validatorActionReviewPacket);

  // Update job state with metadata (do not change lifecycle state)
  const updatedJobState = await setJobState(jobId, {
    statusMetadata: {
      ...(jobState.statusMetadata || {}),
      validatorActionPackageBuilt: true,
      signed: false,
      broadcast: false,
      requiresHumanValidatorSigning: true
    },
    attempts: {
      ...jobState.attempts,
      validatorActionPackage: (jobState.attempts.validatorActionPackage || 0) + 1
    }
  });

  console.log(`[build_validator_action_package] Job ${jobId} state metadata updated: validatorActionPackageBuilt: true`);
  console.log(`[build_validator_action_package] Wrote validator action review packet: ${validatorActionReviewPacketPath}`);
  console.log(`[build_validator_action_package] Wrote unsigned validator action tx: ${unsignedValidatorActionTxPath}`);
  console.log(`[build_validator_action_package] ABI/calldata status: ${unsignedValidatorActionTx.calldataStatus}`);
  console.log(`[build_validator_action_package] Recommended validator action: ${recommendedAction}`);
  console.log("[build_validator_action_package] No signing, no broadcasting, no private key usage.");
  console.log("[build_validator_action_package] Executor lifecycle state left unchanged.");
}

main().catch((err) => {
  console.error("[build_validator_action_package] Fatal error:", err.message || err);
  process.exit(1);
});