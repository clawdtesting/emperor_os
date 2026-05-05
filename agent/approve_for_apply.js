// agent/approve_for_apply.js
// Converts a review_pending job into an unsigned apply transaction package after operator approval.
// Safety: does not sign, does not broadcast, does not manage nonce, does not use private keys.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getJobState, setJobState } from "./state.js";
import { ensureJobArtifactDir, readJson } from "./artifact-manager.js";
import { buildApplyReviewPacket } from "./apply-review-packet.js";
import { buildUnsignedApplyTx } from "./unsigned-apply-builder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const forbiddenChecks = [
  { label: "ethers.Wallet", regex: /ethers\s*\.\s*Wallet/ },
  { label: "sendTransaction", regex: /\bsendTransaction\s*\(/ },
  { label: "signTransaction", regex: /\bsignTransaction\s*\(/ },
  { label: "broadcast", regex: /\bbroadcast\s*\(/ },
  { label: "PRIVATE_KEY", regex: /\bPRIVATE_KEY\b/ },
  { label: "process.env.PRIVATE_KEY", regex: /process\s*\.\s*env\s*\.\s*PRIVATE_KEY/ }
];

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

  if (explicitVersion) {
    return `${explicitVersion}_${numericId}`;
  }

  const candidates = [`v1_${numericId}`, `v2_${numericId}`, `prime_${numericId}`];
  const existing = [];
  for (const candidate of candidates) {
    const state = await getJobState(candidate);
    if (state) existing.push(candidate);
  }

  if (existing.length === 1) return existing[0];
  if (existing.length > 1) {
    throw new Error(
      `Ambiguous jobId ${numericId}. Matching states: ${existing.join(", ")}. Use explicit versioned ID.`
    );
  }

  // fail closed: no silent assumptions
  throw new Error(
    `No state found for jobId ${numericId}. Tried: ${candidates.join(", ")}. Use explicit versioned ID if needed.`
  );
}

async function safetySelfCheck() {
  const filesToCheck = [
    path.join(__dirname, "unsigned-apply-builder.js"),
    path.join(__dirname, "apply-review-packet.js")
  ];

  for (const filePath of filesToCheck) {
    const content = await fs.readFile(filePath, "utf8");
    for (const check of forbiddenChecks) {
      if (check.regex.test(content)) {
        throw new Error(`SAFETY VIOLATION: forbidden pattern "${check.label}" found in ${filePath}`);
      }
    }
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function approveForApply(rawJobId, force = false) {
  console.log(`[approve_for_apply] Starting approval process for jobId: ${rawJobId}`);

  await safetySelfCheck();
  console.log("[approve_for_apply] Safety self-check passed: no signing/broadcast/private-key patterns detected.");

  const versionedJobId = await resolveVersionedJobId(rawJobId);
  console.log(`[approve_for_apply] Resolved job ID: ${versionedJobId}`);

  const jobState = await getJobState(versionedJobId);
  if (!jobState) {
    throw new Error(`Job ${versionedJobId} not found in state`);
  }

  const artifactDir = jobState.artifactDir || path.join(__dirname, "..", "artifacts", `job_${versionedJobId}`);
  await ensureJobArtifactDir(path.basename(artifactDir));

  const applyReviewPacketPath = path.join(artifactDir, "apply_review_packet.json");
  const unsignedApplyTxPath = path.join(artifactDir, "unsigned_apply_tx.json");

  if (jobState.status === "apply_ready" && !force) {
    console.log(`[approve_for_apply] Job ${versionedJobId} is already apply_ready. Idempotent exit (no state transition, no overwrite).`);
    console.log(`[approve_for_apply] Existing apply review packet: ${applyReviewPacketPath}`);
    console.log(`[approve_for_apply] Existing unsigned apply transaction: ${unsignedApplyTxPath}`);
    console.log("[approve_for_apply] Use --force to explicitly regenerate artifacts.");
    return;
  }

  if (jobState.status !== "review_pending" && !(jobState.status === "apply_ready" && force)) {
    throw new Error(`Job ${versionedJobId} must be review_pending (or apply_ready with --force). Current status: ${jobState.status}`);
  }

  if (!jobState.artifactDir) {
    await setJobState(versionedJobId, { artifactDir });
  }

  const decisionPath = path.join(artifactDir, "decision.json");
  const decision = await readJson(decisionPath);
  if (!decision) {
    throw new Error(`decision.json not found at ${decisionPath}`);
  }

  const validDecisions = ["accept_candidate", "accept", "approve"];
  if (!validDecisions.includes(decision.decision)) {
    throw new Error(
      `Job ${versionedJobId} decision is not acceptable: ${decision.decision}. Expected one of: ${validDecisions.join(", ")}`
    );
  }

  const packetPath = path.join(artifactDir, "discovery_review_packet.json");
  const discoveryPacket = await readJson(packetPath);
  if (!discoveryPacket) {
    throw new Error(`discovery_review_packet.json not found at ${packetPath}`);
  }

  const invalidStatuses = ["completed", "disputed", "assigned", "working", "deliverable_ready"];
  if (invalidStatuses.includes(jobState.status)) {
    throw new Error(`Job ${versionedJobId} has invalid status for apply: ${jobState.status}`);
  }

  const applyReviewPacket = buildApplyReviewPacket(jobState, artifactDir);
  const unsignedApplyTx = await buildUnsignedApplyTx(jobState, artifactDir);

  const applyPacketExists = await fileExists(applyReviewPacketPath);
  const unsignedTxExists = await fileExists(unsignedApplyTxPath);

  if ((applyPacketExists || unsignedTxExists) && !force) {
    // In review_pending with preexisting artifacts, do not overwrite by default.
    console.log(`[approve_for_apply] Existing artifacts detected. No overwrite without --force.`);
    console.log(`[approve_for_apply] apply_review_packet.json: ${applyReviewPacketPath}`);
    console.log(`[approve_for_apply] unsigned_apply_tx.json: ${unsignedApplyTxPath}`);
  } else {
    await fs.writeFile(applyReviewPacketPath, JSON.stringify(applyReviewPacket, null, 2), "utf8");
    await fs.writeFile(unsignedApplyTxPath, JSON.stringify(unsignedApplyTx, null, 2), "utf8");
    console.log(`[approve_for_apply] Wrote apply review packet: ${applyReviewPacketPath}`);
    console.log(`[approve_for_apply] Wrote unsigned apply transaction: ${unsignedApplyTxPath}`);
  }

  if (jobState.status !== "apply_ready") {
    await setJobState(versionedJobId, { status: "apply_ready" });
    console.log(`[approve_for_apply] Transitioned ${versionedJobId} -> apply_ready`);
  } else {
    console.log(`[approve_for_apply] Job ${versionedJobId} remains apply_ready.`);
  }

  console.log("[approve_for_apply] Operator handoff:");
  console.log(`  - Review packet: ${applyReviewPacketPath}`);
  console.log(`  - Unsigned tx package: ${unsignedApplyTxPath}`);
  console.log("  - Operator may export this unsigned transaction package to an external wallet flow after independent review.");
  console.log("  - Signing and broadcasting happen outside Emperor OS.");
  console.log("  - Emperor OS did not sign, did not broadcast, does not manage nonce, and does not custody private keys.");
  console.log("  - Human must re-check job status before external signing.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let jobId = null;
  let force = false;

  for (const arg of args) {
    if (arg === "--force") force = true;
    else if (!jobId) jobId = arg;
  }

  if (!jobId) {
    console.error("[approve_for_apply] Usage: node agent/approve_for_apply.js <jobId|v1_001|v2_001|prime_001> [--force]");
    process.exit(1);
  }

  approveForApply(jobId, force).catch((err) => {
    console.error(`[approve_for_apply] Error: ${err.message}`);
    process.exit(1);
  });
}
