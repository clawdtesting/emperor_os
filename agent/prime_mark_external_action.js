// agent/prime_mark_external_action.js
// Records that an external Prime action (commit, reveal, accept-finalist, submit-trial) has been submitted by the operator.
// Safety: does not sign, does not broadcast, does not manage nonce, does not use private keys.
// Only creates a local receipt record.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getProcState, setProcState } from "./prime-state.js";

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

async function safetySelfCheck() {
  const filesToCheck = [
    path.join(__dirname, "prime-tx-builder.js")
  ];

  for (const filePath of filesToCheck) {
    const content = await fs.readFile(filePath, "utf8");
    for (const check of forbiddenChecks) {
      if (check.regex.test(content)) {
        throw new Error(`SAFETY VIOLATION: forbidden pattern \"${check.label}\" found in ${filePath}`);
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

async function markExternalAction(rawProcurementId, action, txHash, force = false) {
  console.log(`[prime_mark_external_action] Marking external action for procurement ${rawProcurementId}, action: ${action}, txHash: ${txHash}`);

  await safetySelfCheck();
  console.log("[prime_mark_external_action] Safety self-check passed: no signing/broadcast/private-key patterns detected.");

  const procurementId = String(rawProcurementId).trim();
  if (!procurementId) throw new Error("Missing procurementId");

  if (!/^0x[0-9a-zA-Z]+$/.test(txHash)) {
    throw new Error(`Invalid txHash format: ${txHash}. Expected 0x-prefixed transaction reference.`);
  }

  const procState = await getProcState(procurementId);
  if (!procState) {
    throw new Error(`No state found for procurement ${procurementId}. Run seed_prime_fixture.js first.`);
  }

  const procRoot = path.join(__dirname, "..", "artifacts", `proc_${procurementId}`);
  const actionMap = {
    commit: { statusAfter: "COMMIT_SUBMITTED", subdir: "application", receiptName: "external_commit_receipt.json" },
    reveal: { statusAfter: "REVEAL_SUBMITTED", subdir: "reveal", receiptName: "external_reveal_receipt.json" },
    "accept-finalist": { statusAfter: "FINALIST_ACCEPT_SUBMITTED", subdir: "finalist", receiptName: "external_accept_finalist_receipt.json" },
    "submit-trial": { statusAfter: "TRIAL_SUBMITTED", subdir: "trial", receiptName: "external_submit_trial_receipt.json" }
  };

  if (!actionMap[action]) {
    throw new Error(`Unsupported action: ${action}. Supported actions: ${Object.keys(actionMap).join(", ")}`);
  }

  const { statusAfter, subdir, receiptName } = actionMap[action];
  const artifactDir = path.join(procRoot, subdir);
  const receiptPath = path.join(artifactDir, receiptName);

  // Check if we should skip due to idempotency
  const receiptExists = await fileExists(receiptPath);

  // Define expected previous statuses for each action
  const expectedPreviousStatus = {
    commit: "COMMIT_READY",
    reveal: "REVEAL_READY",
    "accept-finalist": "FINALIST_ACCEPT_READY",
    "submit-trial": "TRIAL_READY"
  };

  const expectedStatus = expectedPreviousStatus[action];
  if (procState.status !== expectedStatus && !force) {
    throw new Error(`Procurement ${procurementId} must be in ${expectedStatus} to mark external ${action}. Current status: ${procState.status}`);
  }

  if (receiptExists && !force) {
    if (procState.status === statusAfter) {
      console.log(`[prime_mark_external_action] Receipt already exists and procurement already in ${statusAfter}. Idempotent exit.`);
      return;
    }
    console.log(`[prime_mark_external_action] Receipt already exists: ${receiptPath}. Reusing receipt and advancing state.`);
  }

  // Create receipt record
  const receipt = {
    procurementId,
    action,
    txHash,
    markedAt: new Date().toISOString(),
    note: "This is a local receipt recording that the operator claims to have submitted the transaction externally. Emperor OS did not verify, sign, or broadcast this transaction."
  };

  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  console.log(`[prime_mark_external_action] Wrote external receipt: ${receiptPath}`);

  // Update state
  await setProcState(procurementId, { status: statusAfter });
  console.log(`[prime_mark_external_action] Transitioned ${procurementId} -> ${statusAfter}`);

  console.log("[prime_mark_external_action] Operator note:");
  console.log("  - This action records an external transaction claim only.");
  console.log("  - Emperor OS did not verify, sign, or broadcast the transaction.");
  console.log("  - The operator must ensure the transaction was actually submitted and wait for confirmation.");
  console.log("  - The next step in the state machine will be to build the subsequent package (if any).");
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let procurementId = null;
  let action = null;
  let txHash = null;
  let force = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--tx-hash") {
      txHash = args[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (!procurementId) procurementId = arg;
    else if (!action) action = arg;
    else if (!txHash) txHash = arg;
  }

  if (!procurementId || !action || !txHash) {
    console.error("[prime_mark_external_action] Usage: node agent/prime_mark_external_action.js <procurementId> <commit|reveal|accept-finalist|submit-trial> <txHash|--tx-hash VALUE> [--force]");
    process.exit(1);
  }

  markExternalAction(procurementId, action, txHash, force).catch((err) => {
    console.error(`[prime_mark_external_action] Error: ${err.message}`);
    process.exit(1);
  });
}