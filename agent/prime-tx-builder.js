// prime-tx-builder.js
// Builds unsigned tx packages for every Prime action.
//
// SAFETY CONTRACT:
//   - NO private key. NO signing. NO broadcasting.
//   - Every output is a JSON file the operator reviews in MetaMask + Ledger.
//   - Every package includes: decoded call, preconditions, artifact bindings, checklist.
//
// Schema: "emperor-os/prime-unsigned-tx/v1"
//
// Supported actions:
//   commitApplication, revealApplication, acceptFinalist, submitTrial,
//   requestJobCompletion (Prime-linked)

import path from "path";
import { promises as fs } from "fs";
import { encodePrimeCall, decodePrimeCalldata, PRIME_CONTRACT, CHAIN_ID, AGIALPHA_TOKEN, encodeErc20Approve } from "./prime-client.js";
import { CONFIG } from "./config.js";
import { ensureProcSubdir } from "./prime-state.js";

// AGIJobManager for completion tx (Contract 1)
const JOB_MGR_CONTRACT = CONFIG.CONTRACT;

// ── Core unsigned tx package builder ─────────────────────────────────────────

/**
 * Builds a canonical unsigned Prime tx package.
 * @private
 */
function buildPackage({
  procurementId,
  linkedJobId,
  phase,
  contractName,
  contractAddress,
  functionName,
  args,
  calldata,
  preconditions,
  artifactBindings,
  reviewChecklist,
}) {
  const decodedCall = decodePrimeCalldata(calldata);

  return {
    schema:          "emperor-os/prime-unsigned-tx/v1",
    chainId:         CHAIN_ID,
    target:          contractAddress,
    contractName,
    function:        functionName,
    args,
    calldata,
    decodedCall,
    generatedAt:     new Date().toISOString(),
    phase,
    procurementId:   procurementId != null ? String(procurementId) : null,
    linkedJobId:     linkedJobId   != null ? String(linkedJobId)   : null,
    preconditions,
    artifactBindings,
    reviewChecklist,
    reviewMessage:
      "Decode and verify every field before signing. " +
      "Use MetaMask + Ledger. Never skip the checklist.",
    safety: {
      noPrivateKeyInRuntime: true,
      noSigningInRuntime:    true,
      noBroadcastInRuntime:  true,
    },
  };
}

async function writeTxFile(dir, filename, pkg) {
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, filename);
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(pkg, null, 2), "utf8");
  await fs.rename(tmp, p);
  return p;
}

function normalizePreparedTx(preparedTx) {
  const tx = preparedTx?.tx ?? preparedTx?.transaction ?? preparedTx;
  if (!tx || typeof tx !== "object") throw new Error("prepared tx missing");
  if (!tx.to || !tx.data) throw new Error("prepared tx must include to + data");
  return {
    to: String(tx.to),
    data: String(tx.data),
    value: String(tx.value ?? "0"),
  };
}

// ── commitApplication ─────────────────────────────────────────────────────────

/**
 * Builds unsigned commitApplication tx package.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string|number} opts.linkedJobId
 * @param {string} opts.commitment    bytes32 hex — keccak256(procId, agent, appURI, salt)
 * @param {string} opts.subdomain     agent subdomain
 * @param {string[]} opts.merkleProof bytes32[] proof
 * @param {string} opts.applicationArtifactPath  path to application_brief.md
 * @returns {Promise<{path: string, package: object}>}
 */
export async function buildCommitApplicationTx(opts) {
  const { procurementId, linkedJobId, commitment, subdomain, merkleProof, applicationArtifactPath } = opts;

  const args = [
    BigInt(procurementId),
    commitment,
    subdomain,
    merkleProof,
  ];

  const { to, data } = encodePrimeCall("commitApplication", args);

  const pkg = buildPackage({
    procurementId,
    linkedJobId,
    phase:            "COMMIT",
    contractName:     "AGIJobDiscoveryPrime",
    contractAddress:  PRIME_CONTRACT,
    functionName:     "commitApplication",
    args: {
      procurementId: String(procurementId),
      commitment,
      subdomain,
      proof: merkleProof,
    },
    calldata: data,
    preconditions: [
      "Commitment hash computed correctly: keccak256(procurementId, agentAddress, applicationURI, salt)",
      "Application markdown pinned to IPFS and applicationURI recorded in commitment_material.json",
      "Commit window is currently open (check deadlines_and_windows.json)",
      "Agent subdomain is registered and merkle proof is valid",
      "Salt is stored securely in commitment_material.json (needed for reveal)",
    ],
    artifactBindings: [
      { file: "application/application_brief.md",        role: "Application content (pinned at applicationURI)" },
      { file: "application/commitment_material.json",    role: "Salt and commitment hash source" },
      { file: "application/application_payload.json",    role: "Full application payload including URI" },
    ],
    reviewChecklist: [
      "Confirm procurementId matches the intended procurement",
      "Confirm commitment hash in this tx matches commitment_material.json",
      "Confirm subdomain is our correct agent subdomain",
      "Confirm merkle proof elements match registered proof",
      "Confirm target contract is AGIJobDiscoveryPrime",
      "Confirm chainId is 1 (Ethereum Mainnet)",
      "Confirm commit window has not expired",
    ],
  });

  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "application");
  const filePath = await writeTxFile(dir, "unsigned_commit_tx.json", pkg);

  return { path: filePath, package: pkg };
}

// ── revealApplication ─────────────────────────────────────────────────────────

/**
 * Builds unsigned revealApplication tx package.
 */
export async function buildRevealApplicationTx(opts) {
  const { procurementId, linkedJobId, subdomain, merkleProof, salt, applicationURI } = opts;

  const args = [
    BigInt(procurementId),
    subdomain,
    merkleProof,
    salt,
    applicationURI,
  ];

  const { to, data } = encodePrimeCall("revealApplication", args);

  const pkg = buildPackage({
    procurementId,
    linkedJobId,
    phase:           "REVEAL",
    contractName:    "AGIJobDiscoveryPrime",
    contractAddress: PRIME_CONTRACT,
    functionName:    "revealApplication",
    args: {
      procurementId: String(procurementId),
      subdomain,
      proof:         merkleProof,
      salt,
      applicationURI,
    },
    calldata: data,
    preconditions: [
      "Reveal window is currently open",
      "Salt matches the salt stored in commitment_material.json",
      "applicationURI matches the URI used to compute the commitment hash",
      "Re-computed commitment hash matches on-chain stored commitment (verify in commitment_verification.json)",
      "Agent subdomain and merkle proof are correct",
    ],
    artifactBindings: [
      { file: "application/commitment_material.json",  role: "Salt source — must match" },
      { file: "reveal/commitment_verification.json",   role: "Hash verification result" },
      { file: "reveal/reveal_payload.json",            role: "Full reveal payload" },
    ],
    reviewChecklist: [
      "Confirm reveal window is open",
      "Confirm salt in this tx matches commitment_material.json",
      "Confirm applicationURI in this tx is the same URI that was committed",
      "Confirm commitment_verification.json shows verificationPassed = true",
      "Confirm subdomain and merkle proof are correct",
      "Confirm target contract is AGIJobDiscoveryPrime",
      "Confirm chainId is 1",
    ],
  });

  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "reveal");
  const filePath = await writeTxFile(dir, "unsigned_reveal_tx.json", pkg);

  return { path: filePath, package: pkg };
}

// ── acceptFinalist ────────────────────────────────────────────────────────────

/**
 * Builds unsigned acceptFinalist tx package.
 */
export async function buildAcceptFinalistTx(opts) {
  const { procurementId, linkedJobId } = opts;

  const args = [BigInt(procurementId)];
  const { to, data } = encodePrimeCall("acceptFinalist", args);

  const pkg = buildPackage({
    procurementId,
    linkedJobId,
    phase:           "FINALIST_ACCEPT",
    contractName:    "AGIJobDiscoveryPrime",
    contractAddress: PRIME_CONTRACT,
    functionName:    "acceptFinalist",
    args: {
      procurementId: String(procurementId),
    },
    calldata: data,
    preconditions: [
      "Our agent address is confirmed in ShortlistFinalized event finalists array",
      "Finalist accept window is currently open",
      "Stake requirements reviewed and acceptable (see finalist/stake_requirements.json)",
      "Trial execution plan is documented (see finalist/trial_execution_plan.json)",
    ],
    artifactBindings: [
      { file: "finalist/finalist_acceptance_packet.json", role: "Acceptance decision record" },
      { file: "finalist/stake_requirements.json",         role: "Stake requirement review" },
      { file: "finalist/trial_execution_plan.json",       role: "Trial plan" },
    ],
    reviewChecklist: [
      "Confirm our agent address is in the ShortlistFinalized event",
      "Confirm finalist accept window is open",
      "Confirm stake requirements are acceptable",
      "Confirm trial plan is feasible within trial deadline",
      "Confirm target contract is AGIJobDiscoveryPrime",
      "Confirm chainId is 1",
    ],
  });

  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "finalist");
  const filePath = await writeTxFile(dir, "unsigned_accept_finalist_tx.json", pkg);

  return { path: filePath, package: pkg };
}

// ── submitTrial ───────────────────────────────────────────────────────────────

/**
 * Builds unsigned submitTrial tx package.
 */
export async function buildSubmitTrialTx(opts) {
  const { procurementId, linkedJobId, trialURI } = opts;

  const args = [BigInt(procurementId), trialURI];
  const { to, data } = encodePrimeCall("submitTrial", args);

  const pkg = buildPackage({
    procurementId,
    linkedJobId,
    phase:           "TRIAL",
    contractName:    "AGIJobDiscoveryPrime",
    contractAddress: PRIME_CONTRACT,
    functionName:    "submitTrial",
    args: {
      procurementId: String(procurementId),
      trialURI,
    },
    calldata: data,
    preconditions: [
      "Trial deliverable artifacts are complete",
      "trialURI is publicly reachable via IPFS gateway",
      "Fetchback verification passed (see trial/fetchback_verification.json)",
      "Trial window is currently open",
    ],
    artifactBindings: [
      { file: "trial/trial_artifact_manifest.json",  role: "Trial artifact index" },
      { file: "trial/publication_record.json",        role: "IPFS publication record" },
      { file: "trial/fetchback_verification.json",    role: "Fetchback verification result" },
    ],
    reviewChecklist: [
      "Confirm trialURI matches publication_record.json and is reachable",
      "Confirm fetchback_verification.json shows verified = true",
      "Confirm trial window is open",
      "Confirm procurementId is correct",
      "Confirm target contract is AGIJobDiscoveryPrime",
      "Confirm chainId is 1",
    ],
  });

  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "trial");
  const filePath = await writeTxFile(dir, "unsigned_submit_trial_tx.json", pkg);

  return { path: filePath, package: pkg };
}

export async function buildApproveAgialphaTx(opts) {
  const { procurementId, linkedJobId, spender, amountWei } = opts;
  const { data } = encodeErc20Approve(spender, BigInt(amountWei), AGIALPHA_TOKEN);
  const pkg = {
    schema:      "emperor-os/prime-unsigned-tx/v1",
    chainId:     CHAIN_ID,
    target:      AGIALPHA_TOKEN,
    contractName:"AGIALPHA",
    function:    "approve",
    args:        { spender, amountWei: String(amountWei) },
    calldata:    data,
    decodedCall: `approve(spender=${spender}, amount=${String(amountWei)})`,
    generatedAt: new Date().toISOString(),
    phase:       "FINALIST_PREAPPROVE",
    procurementId: String(procurementId),
    linkedJobId: linkedJobId != null ? String(linkedJobId) : null,
    preconditions: [
      "Required finalist top-up amount computed and non-zero",
      "Current AGIALPHA allowance is below required top-up",
      "Operator reviewed token and spender addresses",
    ],
    reviewChecklist: [
      "Confirm token address is AGIALPHA ERC20",
      "Confirm spender is AGIJobDiscoveryPrime contract",
      "Confirm amount covers finalist top-up only",
      "Sign with Ledger via MetaMask",
    ],
  };
  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "finalist");
  const filePath = await writeTxFile(dir, "unsigned_approve_agialpha_tx.json", pkg);
  return { path: filePath, package: pkg };
}

// ── requestJobCompletion (Prime-linked) ───────────────────────────────────────
// Uses the AGIJobManager Contract 1 function, but includes procurement provenance.

/**
 * Builds unsigned requestJobCompletion tx package for a Prime-linked job.
 *
 * This reuses the Contract 1 completion flow but adds procurement provenance
 * so the operator can trace the completion back to the original procurement.
 */
export async function buildRequestJobCompletionTx(opts) {
  const { procurementId, linkedJobId, completionURI, agentSubdomain } = opts;

  // Encode via the existing AGIJobManager ABI
  // We use a minimal inline encoding here to avoid circular deps with v1 tx-builder.
  // The existing v1 tx-builder handles the actual ABI encoding for Contract 1.
  const { createRequire } = await import("module");
  const { fileURLToPath }  = await import("url");
  const { ethers }         = await import("ethers");
  const require            = createRequire(import.meta.url);
  const { dirname }        = await import("path");

  const abiPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "core", "AGIJobManager.json");
  const abi     = require(abiPath);
  const iface   = new ethers.Interface(abi);
  const calldata = iface.encodeFunctionData("requestJobCompletion", [
    BigInt(linkedJobId),
    completionURI,
  ]);
  const decodedCall = (() => {
    try {
      const desc = iface.parseTransaction({ data: calldata });
      return `${desc.name}(jobId=${linkedJobId}, completionURI=${completionURI}, subdomain=${agentSubdomain})`;
    } catch { return `requestJobCompletion(${linkedJobId}, ${completionURI}, ${agentSubdomain})`; }
  })();

  const pkg = {
    schema:          "emperor-os/prime-unsigned-tx/v1",
    chainId:         CHAIN_ID,
    target:          JOB_MGR_CONTRACT,
    contractName:    "AGIJobManager",
    function:        "requestJobCompletion",
    args: {
      jobId:         String(linkedJobId),
      completionURI,
    },
    calldata,
    decodedCall,
    generatedAt:     new Date().toISOString(),
    phase:           "COMPLETION",
    procurementId:   String(procurementId),
    linkedJobId:     String(linkedJobId),
    preconditions: [
      "We are confirmed as the selected agent for this procurement",
      "completionURI is publicly reachable via IPFS",
      "Fetchback verification passed (see completion/fetchback_verification.json)",
      "job_completion.json is complete and correct",
      "Procurement provenance is linked in completion bundle",
    ],
    artifactBindings: [
      { file: "completion/job_completion.json",           role: "Job completion metadata" },
      { file: "completion/publication_record.json",        role: "IPFS publication record" },
      { file: "completion/fetchback_verification.json",    role: "Fetchback verification" },
      { file: "selection/selected_agent_status.json",      role: "Selection confirmation" },
    ],
    reviewChecklist: [
      "Confirm we are the selected agent (selection/selected_agent_status.json)",
      "Confirm completionURI is reachable and hash matches",
      "Confirm fetchback_verification.json shows verified = true",
      "Confirm target contract is AGIJobManager (Contract 1)",
      "Confirm linkedJobId matches our selected procurement's job",
      "Confirm chainId is 1",
    ],
    reviewMessage:
      "This is the final completion tx. It submits our work to the AGIJobManager for settlement. " +
      "Verify every field. Use MetaMask + Ledger.",
    safety: {
      noPrivateKeyInRuntime: true,
      noSigningInRuntime:    true,
      noBroadcastInRuntime:  true,
    },
  };

  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "completion");
  const filePath = await writeTxFile(dir, "unsigned_request_completion_tx.json", pkg);

  return { path: filePath, package: pkg };
}

export async function buildValidatorScoreCommitTx(opts) {
  const { procurementId, linkedJobId, scoreCommitment, preparedTx } = opts;
  const tx = normalizePreparedTx(preparedTx);
  const pkg = buildPackage({
    procurementId,
    linkedJobId,
    phase: "VALIDATOR_SCORE_COMMIT",
    contractName: "AGIJobDiscoveryPrime",
    contractAddress: tx.to,
    functionName: "scoreCommit",
    args: { procurementId: String(procurementId), scoreCommitment },
    calldata: tx.data,
    preconditions: [
      "Validator role is confirmed for this procurement",
      "Score commit window is open",
      "Commitment was computed deterministically from score + salt",
    ],
    artifactBindings: [
      { file: "scoring/score_commit_payload.json", role: "score commitment payload" },
    ],
    reviewChecklist: [
      "Confirm score commitment matches local payload",
      "Confirm score commit window is open",
      "Confirm target is AGIJobDiscoveryPrime",
    ],
  });
  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "scoring");
  const filePath = await writeTxFile(dir, "unsigned_score_commit_tx.json", pkg);
  return { path: filePath, package: pkg };
}

export async function buildValidatorScoreRevealTx(opts) {
  const { procurementId, linkedJobId, scoreValue, salt, preparedTx } = opts;
  const tx = normalizePreparedTx(preparedTx);
  const pkg = buildPackage({
    procurementId,
    linkedJobId,
    phase: "VALIDATOR_SCORE_REVEAL",
    contractName: "AGIJobDiscoveryPrime",
    contractAddress: tx.to,
    functionName: "scoreReveal",
    args: { procurementId: String(procurementId), score: scoreValue, salt },
    calldata: tx.data,
    preconditions: [
      "Validator score reveal window is open",
      "salt matches score_commit_payload.json",
      "Recomputed commitment matches score commit",
    ],
    artifactBindings: [
      { file: "scoring/score_commit_payload.json", role: "commitment source" },
      { file: "scoring/score_reveal_payload.json", role: "reveal payload" },
    ],
    reviewChecklist: [
      "Confirm score + salt are correct",
      "Confirm reveal window is open",
      "Confirm target is AGIJobDiscoveryPrime",
    ],
  });
  const dir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "scoring");
  const filePath = await writeTxFile(dir, "unsigned_score_reveal_tx.json", pkg);
  return { path: filePath, package: pkg };
}
