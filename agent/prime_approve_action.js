// agent/prime_approve_action.js
// Approves and builds unsigned Prime transaction packages after operator approval.
// Safety: does not sign, does not broadcast, does not manage nonce, does not use private keys.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { getProcState, setProcState, ensureProcSubdir } from "./prime-state.js";
import {
  buildCommitApplicationTx,
  buildRevealApplicationTx,
  buildAcceptFinalistTx,
  buildSubmitTrialTx,
} from "./prime-tx-builder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const forbiddenChecks = [
  { label: "ethers.Wallet", regex: /ethers\s*\.\s*Wallet/ },
  { label: "sendTransaction", regex: /\bsendTransaction\s*\(/ },
  { label: "signTransaction", regex: /\bsignTransaction\s*\(/ },
  { label: "broadcast", regex: /\bbroadcast\s*\(/ },
  { label: "PRIVATE_KEY", regex: /\bPRIVATE_KEY\b/ },
  { label: "process.env.PRIVATE_KEY", regex: /process\s*\.\s*env\s*\.\s*PRIVATE_KEY/ },
];

const actionMap = {
  commit: {
    status: "COMMIT_READY",
    from: ["APPLICATION_DRAFTED"],
    builder: buildCommitApplicationTx,
    subdir: "application",
    txName: "unsigned_commit_tx.json",
    packetName: "prime_action_review_packet.json",
  },
  reveal: {
    status: "REVEAL_READY",
    from: ["COMMIT_SUBMITTED"],
    builder: buildRevealApplicationTx,
    subdir: "reveal",
    txName: "unsigned_reveal_tx.json",
    packetName: "prime_action_review_packet.json",
  },
  "accept-finalist": {
    status: "FINALIST_ACCEPT_READY",
    from: ["REVEAL_SUBMITTED", "SHORTLISTED"],
    builder: buildAcceptFinalistTx,
    subdir: "finalist",
    txName: "unsigned_accept_finalist_tx.json",
    packetName: "prime_action_review_packet.json",
  },
  "submit-trial": {
    status: "TRIAL_READY",
    from: ["FINALIST_ACCEPT_SUBMITTED", "TRIAL_IN_PROGRESS"],
    builder: buildSubmitTrialTx,
    subdir: "trial",
    txName: "unsigned_submit_trial_tx.json",
    packetName: "prime_action_review_packet.json",
  },
};

async function safetySelfCheck() {
  const filesToCheck = [path.join(__dirname, "prime-tx-builder.js")];
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

function readJson(filePath, label) {
  return fs.readFile(filePath, "utf8").then((raw) => {
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in ${label}: ${err.message}`);
    }
  });
}

function normalizeBytes32Hex(value, fieldName, context = {}) {
  if (typeof value !== "string" || value.length === 0) return value;
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value;

  const allowFixtureNormalization = context?.allowFixtureNormalization === true;
  if (!allowFixtureNormalization) {
    throw new Error(
      `Malformed ${fieldName}: expected 0x + 64 hex chars. ` +
      `Refusing runtime normalization outside fixture mode.`
    );
  }

  const normalized = ethers.keccak256(ethers.toUtf8Bytes(value));
  console.warn(
    `[prime_approve_action] FIXTURE NORMALIZATION applied for ${fieldName}. ` +
    `Original malformed value was deterministically mapped via keccak256.`
  );
  return normalized;
}

function normalizeCommitmentMaterial(material, context = {}) {
  const commitmentHash = normalizeBytes32Hex(
    material.commitmentHash ?? material.commitment ?? material.hash,
    "commitmentHash",
    context
  );
  const agentSubdomain = material.agentSubdomain ?? material.subdomain;
  const merkleProof = material.merkleProof ?? material.proof;
  const salt = normalizeBytes32Hex(material.salt, "salt", context);
  const linkedJobId = material.linkedJobId ?? material.jobId ?? null;

  return { commitmentHash, agentSubdomain, merkleProof, salt, linkedJobId };
}

function validateRequired(action, data) {
  const missing = [];
  if (action === "commit") {
    if (!data.commitment) missing.push("commitment");
    if (!data.subdomain) missing.push("subdomain");
    if (!Array.isArray(data.merkleProof) || data.merkleProof.length === 0) missing.push("proof");
  } else if (action === "reveal") {
    if (!data.subdomain) missing.push("subdomain");
    if (!Array.isArray(data.merkleProof) || data.merkleProof.length === 0) missing.push("proof");
    if (!data.salt) missing.push("salt");
    if (!data.applicationURI) missing.push("applicationURI");
  } else if (action === "accept-finalist") {
    if (!data.procurementId) missing.push("procurementId");
  } else if (action === "submit-trial") {
    if (!data.trialURI) missing.push("trialURI");
  }
  if (missing.length) {
    throw new Error(`Missing required ${action} fields: ${missing.join(", ")}`);
  }
}

function buildReviewPacket(action, status, unsignedPkg, txPath) {
  return {
    schema: "emperor-os/prime-action-review-packet/v1",
    action,
    targetStatus: status,
    generatedAt: new Date().toISOString(),
    txPackagePath: txPath,
    humanReviewRequired: true,
    executableAsIs: false,
    unsignedTxPackage: unsignedPkg,
    operatorChecklist: unsignedPkg?.reviewChecklist ?? [],
    safety: {
      noPrivateKeyInRuntime: true,
      noSigningInRuntime: true,
      noBroadcastInRuntime: true,
    },
  };
}

async function buildActionOptions(action, procurementId, procRoot, procState) {
  const fixtureMode = String(procurementId) === "1001";
  const normalizationContext = { allowFixtureNormalization: fixtureMode };

  if (action === "commit") {
    const commitmentPath = path.join(procRoot, "application", "commitment_material.json");
    const material = normalizeCommitmentMaterial(
      await readJson(commitmentPath, "application/commitment_material.json"),
      normalizationContext
    );
    const opts = {
      procurementId,
      linkedJobId: procState.linkedJobId ?? material.linkedJobId ?? null,
      commitment: material.commitmentHash,
      subdomain: material.agentSubdomain,
      merkleProof: material.merkleProof,
      applicationArtifactPath: path.join(procRoot, "application", "application_brief.md"),
    };
    validateRequired(action, opts);
    return opts;
  }

  if (action === "reveal") {
    const commitmentPath = path.join(procRoot, "application", "commitment_material.json");
    const payloadPath = path.join(procRoot, "application", "application_payload.json");
    const material = normalizeCommitmentMaterial(
      await readJson(commitmentPath, "application/commitment_material.json"),
      normalizationContext
    );
    const payload = await readJson(payloadPath, "application/application_payload.json");
    const opts = {
      procurementId,
      linkedJobId: procState.linkedJobId ?? material.linkedJobId ?? null,
      subdomain: material.agentSubdomain,
      merkleProof: material.merkleProof,
      salt: material.salt,
      applicationURI: payload.applicationURI,
    };
    validateRequired(action, opts);
    return opts;
  }

  if (action === "accept-finalist") {
    const opts = { procurementId, linkedJobId: procState.linkedJobId ?? null };
    validateRequired(action, opts);
    return opts;
  }

  if (action === "submit-trial") {
    const trialPublicationPath = path.join(procRoot, "trial", "publication_record.json");
    const trialPayloadPath = path.join(procRoot, "trial", "trial_payload.json");
    let trialURI = null;
    if (await fileExists(trialPublicationPath)) {
      const pub = await readJson(trialPublicationPath, "trial/publication_record.json");
      trialURI = pub.trialURI ?? pub.uri ?? pub.applicationURI ?? null;
    }
    if (!trialURI && await fileExists(trialPayloadPath)) {
      const payload = await readJson(trialPayloadPath, "trial/trial_payload.json");
      trialURI = payload.trialURI ?? payload.uri ?? null;
    }
    const opts = { procurementId, linkedJobId: procState.linkedJobId ?? null, trialURI };
    validateRequired(action, opts);
    return opts;
  }

  throw new Error(`Unsupported action: ${action}`);
}

export async function approvePrimeAction(rawProcurementId, action, force = false) {
  console.log(`[prime_approve_action] Starting approval for procurement ${rawProcurementId}, action: ${action}`);

  await safetySelfCheck();
  console.log("[prime_approve_action] Safety self-check passed: no signing/broadcast/private-key patterns detected.");

  const procurementId = String(rawProcurementId).trim();
  if (!procurementId) throw new Error("Missing procurementId");

  const procState = await getProcState(procurementId);
  if (!procState) throw new Error(`No state found for procurement ${procurementId}. Run seed_prime_fixture.js first.`);

  const spec = actionMap[action];
  if (!spec) throw new Error(`Unsupported action: ${action}. Supported actions: ${Object.keys(actionMap).join(", ")}`);

  const procRoot = path.join(__dirname, "..", "artifacts", `proc_${procurementId}`);
  const artifactDir = path.join(procRoot, spec.subdir);
  await ensureProcSubdir(procurementId, spec.subdir);

  const txPath = path.join(artifactDir, spec.txName);
  const packetPath = path.join(artifactDir, spec.packetName);

  if (procState.status === spec.status && !force) {
    console.log(`[prime_approve_action] Procurement ${procurementId} already in ${spec.status}. Idempotent exit.`);
    console.log(`[prime_approve_action] Existing packet: ${packetPath}`);
    console.log(`[prime_approve_action] Existing tx: ${txPath}`);
    console.log("[prime_approve_action] Use --force to regenerate artifacts.");
    return;
  }

  if (!force && !spec.from.includes(procState.status)) {
    throw new Error(`Invalid transition from ${procState.status} to ${spec.status}. Allowed prior states: [${spec.from.join(", ")}]`);
  }

  const opts = await buildActionOptions(action, procurementId, procRoot, procState);
  const result = await spec.builder(opts);
  if (!result || !result.package) {
    throw new Error(`Builder returned invalid result for ${action}. Expected { path, package }.`);
  }

  const unsignedTx = result.package;
  const packet = buildReviewPacket(action, spec.status, unsignedTx, txPath);

  await fs.writeFile(packetPath, JSON.stringify(packet, null, 2), "utf8");
  await fs.writeFile(txPath, JSON.stringify(unsignedTx, null, 2), "utf8");

  console.log(`[prime_approve_action] Wrote review packet: ${packetPath}`);
  console.log(`[prime_approve_action] Wrote unsigned tx: ${txPath}`);

  await setProcState(procurementId, {
    status: spec.status,
    txHandoffs: {
      ...(procState.txHandoffs ?? {}),
      [action]: { path: txPath, generatedAt: new Date().toISOString() },
    },
  });

  console.log(`[prime_approve_action] Transitioned ${procurementId} -> ${spec.status}`);
  console.log("[prime_approve_action] Emperor OS did not sign, broadcast, or use private keys.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let procurementId = null;
  let action = null;
  let force = false;

  for (const arg of args) {
    if (arg === "--force") force = true;
    else if (!procurementId) procurementId = arg;
    else if (!action) action = arg;
  }

  if (!procurementId || !action) {
    console.error("[prime_approve_action] Usage: node agent/prime_approve_action.js <procurementId> <commit|reveal|accept-finalist|submit-trial> [--force]");
    process.exit(1);
  }

  approvePrimeAction(procurementId, action, force).catch((err) => {
    console.error(`[prime_approve_action] Error: ${err.message}`);
    process.exit(1);
  });
}
