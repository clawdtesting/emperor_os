// prime-orchestrator.js
// Top-level orchestrator for the AGIJobDiscoveryPrime (Track B) lifecycle.
//
// Drives a single procurement from discovery through completion by
// consulting the next-action engine and dispatching to the appropriate
// phase handler. Each cycle is idempotent and restart-safe.
//
// Usage:
//   import { advanceProcurement, advanceAllActive } from "./prime-orchestrator.js";
//   await advanceProcurement({ procurementId, agentAddress });
//   await advanceAllActive({ agentAddress });
//
// SAFETY CONTRACT:
//   - No private key. No signing. No broadcasting.
//   - All chain-write actions produce unsigned tx packages for operator review.
//   - All state transitions go through prime-state.js with validation.
//   - All actions are gated by prime-review-gates.js before tx building.

import path from "path";
import { CONFIG } from "./config.js";
import {
  getProcState,
  setProcState,
  transitionProcStatus,
  listActiveProcurements,
  writeProcCheckpoint,
  readJson,
  assertStateIntegrity,
} from "./prime-state.js";
import {
  PROC_STATUS,
  deriveChainPhase,
  CHAIN_PHASE,
} from "./prime-phase-model.js";
import { computeNextAction } from "./prime-next-action.js";
import {
  fetchProcurement,
  fetchApplicationView,
  computeCommitment,
  generateSalt,
} from "./prime-client.js";
import { inspectProcurement } from "./prime-inspector.js";
import { writeInspectionExtras, writeApplicationBundle, writeRevealBundle, writeFinalistBundle, writeTrialBundle } from "./prime-artifact-builder.js";
import { writeReconciliationSnapshot } from "./prime-reconciliation.js";
import {
  buildCommitApplicationTx,
  buildRevealApplicationTx,
  buildAcceptFinalistTx,
  buildSubmitTrialTx,
  buildRequestJobCompletionTx,
} from "./prime-tx-builder.js";
import {
  assertCommitGate,
  assertRevealGate,
  assertFinalistAcceptGate,
  assertTrialSubmitGate,
  assertCompletionGate,
  checkGate,
} from "./prime-review-gates.js";
import {
  generateApplicationContent,
  generateTrialContent,
  generateCompletionSummary,
} from "./prime-content.js";
import {
  activateBridge,
  fetchLinkedJobSpec,
  recordLinkedJobCompletion,
} from "./prime-execution-bridge.js";
import {
  createRetrievalPacket,
  extractSearchKeywords,
} from "./prime-retrieval.js";

// ── Main single-procurement advance ──────────────────────────────────────────

/**
 * Advances a single procurement one step through the lifecycle.
 *
 * Reads the current state, fetches chain data, computes the next action,
 * and dispatches to the appropriate handler. Idempotent — safe to call
 * repeatedly on the same procurement.
 *
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {string} [opts.agentAddress]    - our agent wallet address
 * @param {boolean} [opts.dryRun]         - if true, compute next action but don't execute
 * @returns {Promise<AdvanceResult>}
 */
export async function advanceProcurement({ procurementId, agentAddress, dryRun = false }) {
  const id = String(procurementId);
  const now = Math.floor(Date.now() / 1000);

  log(`Advancing procurement #${id}…`);

  // 1. Load local state
  const state = await getProcState(id);
  if (!state) {
    return result(id, "SKIP", "No local state found. Run monitor to discover this procurement first.");
  }

  // Integrity check
  assertStateIntegrity(state);

  // 2. Fetch chain data
  let procStruct, appView;
  try {
    procStruct = await fetchProcurement(id);
    appView = agentAddress ? await fetchApplicationView(id, agentAddress) : null;
  } catch (err) {
    return result(id, "ERROR", `Chain read failed: ${err.message}`);
  }

  // 3. Compute next action
  const nextAction = computeNextAction({ procState: state, procStruct, appView, nowSecs: now });
  await writeProcCheckpoint(id, "next_action.json", nextAction);
  await writeReconciliationSnapshot({ procurementId: id, nextAction });

  log(`  #${id} status=${state.status} action=${nextAction.action}` +
    (nextAction.blockedReason ? ` BLOCKED: ${nextAction.blockedReason}` : ""));

  if (dryRun) {
    return result(id, "DRY_RUN", nextAction.summary, { nextAction });
  }

  // 4. Dispatch to handler
  try {
    switch (nextAction.action) {
      case "TERMINAL":
      case "NONE":
        return result(id, "NOOP", nextAction.summary, { nextAction });

      case "INSPECT":
        return await handleInspect(id, agentAddress);

      case "EVALUATE_FIT":
        return await handleEvaluateFit(id);

      case "DRAFT_APPLICATION":
        return await handleDraftApplication(id, agentAddress, procStruct);

      case "BUILD_COMMIT_TX":
        return await handleBuildCommitTx(id, procStruct);

      case "BUILD_REVEAL_TX":
        return await handleBuildRevealTx(id, procStruct);

      case "CHECK_SHORTLIST":
        return result(id, "NOOP", "Shortlist detection handled by prime-monitor.js polling loop.");

      case "BUILD_FINALIST_TX":
        return await handleBuildFinalistTx(id, procStruct);

      case "BUILD_TRIAL":
        return await handleBuildTrial(id, procStruct, agentAddress);

      case "WAIT_SCORING":
        return result(id, "NOOP", "Waiting for validators to score. No action needed.");

      case "CHECK_WINNER":
        return result(id, "NOOP", "Winner detection handled by prime-monitor.js polling loop.");

      case "EXECUTE_JOB":
        return await handleExecuteJob(id, agentAddress);

      case "BUILD_COMPLETION_TX":
        return await handleBuildCompletionTx(id, state);

      default:
        return result(id, "UNKNOWN", `Unhandled action: ${nextAction.action}`, { nextAction });
    }
  } catch (err) {
    log(`  #${id} handler error: ${err.message}`);
    return result(id, "ERROR", err.message, { nextAction });
  }
}

// ── Advance all active procurements ──────────────────────────────────────────

/**
 * Advances all active (non-terminal) procurements one step each.
 *
 * @param {object} opts
 * @param {string} [opts.agentAddress]
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<AdvanceResult[]>}
 */
export async function advanceAllActive({ agentAddress, dryRun = false } = {}) {
  const active = await listActiveProcurements();
  if (active.length === 0) {
    log("No active procurements to advance.");
    return [];
  }

  log(`Advancing ${active.length} active procurement(s)…`);
  const results = [];

  for (const state of active) {
    const r = await advanceProcurement({
      procurementId: state.procurementId,
      agentAddress,
      dryRun,
    });
    results.push(r);
  }

  return results;
}

// ── Status summary ───────────────────────────────────────────────────────────

/**
 * Returns a structured summary of all active procurements and their next actions.
 * Read-only — no state changes.
 */
export async function getOrchestratorStatus({ agentAddress } = {}) {
  const active = await listActiveProcurements();
  const now = Math.floor(Date.now() / 1000);
  const entries = [];

  for (const state of active) {
    const id = state.procurementId;
    let nextAction = null;
    try {
      const procStruct = await fetchProcurement(id);
      const appView = agentAddress ? await fetchApplicationView(id, agentAddress) : null;
      nextAction = computeNextAction({ procState: state, procStruct, appView, nowSecs: now });
    } catch {
      nextAction = { action: "ERROR", summary: "Chain read failed" };
    }

    entries.push({
      procurementId: id,
      status: state.status,
      action: nextAction.action,
      summary: nextAction.summary,
      blocked: nextAction.blockedReason ?? null,
      urgent: nextAction.urgent ?? false,
    });
  }

  return {
    activeCount: entries.length,
    entries,
    generatedAt: new Date().toISOString(),
  };
}

// ── Phase handlers ───────────────────────────────────────────────────────────

async function handleInspect(procurementId, agentAddress) {
  const bundle = await inspectProcurement({
    procurementId,
    agentAddress,
    writeArtifacts: true,
  });

  await setProcState(procurementId, {
    status: PROC_STATUS.INSPECTED,
    linkedJobId: bundle.procurementSnapshot.jobId,
    employer: bundle.procurementSnapshot.employer,
    lastChainSync: new Date().toISOString(),
  });

  return result(procurementId, "ADVANCED", `Inspected — chainPhase=${bundle.procurementSnapshot.chainPhase}`);
}

async function handleEvaluateFit(procurementId) {
  // Load the inspection bundle
  const inspDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "inspection");
  const jobSnapshot = await readJson(path.join(inspDir, "linked_job_snapshot.json"), null);
  const procSnapshot = await readJson(path.join(inspDir, "procurement_snapshot.json"), null);

  if (!procSnapshot) {
    return result(procurementId, "BLOCKED", "No procurement_snapshot.json — re-inspect first.");
  }

  // Fetch full job spec via MCP if available
  const state = await getProcState(procurementId);
  let jobSpec = await readJson(path.join(inspDir, "normalized_job_spec.json"), null);

  if (!jobSpec && state?.linkedJobId && CONFIG.AGI_ALPHA_MCP) {
    try {
      await fetchLinkedJobSpec({ procurementId, linkedJobId: state.linkedJobId });
      jobSpec = await readJson(
        path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "completion", "linked_job_spec.json"),
        null
      );
    } catch (err) {
      log(`  #${procurementId} MCP spec fetch failed: ${err.message}`);
    }
  }

  // Deterministic fit evaluation (no LLM needed)
  const fitEvaluation = evaluateFitDeterministic(procurementId, jobSpec, procSnapshot);

  // Write inspection extras
  const nextAction = computeNextAction({
    procState: { ...state, fitEvaluatedAt: new Date().toISOString() },
    procStruct: procSnapshot,
    appView: null,
  });

  await writeInspectionExtras(procurementId, {
    normalizedJobSpec: jobSpec,
    fitEvaluation,
    nextAction,
  });

  // Mark fit as evaluated — operator must approve/reject
  await setProcState(procurementId, {
    fitEvaluatedAt: new Date().toISOString(),
    fitScore: fitEvaluation.score,
  });

  return result(procurementId, "ADVANCED",
    `Fit evaluated: score=${fitEvaluation.score}, decision=${fitEvaluation.decision}. Operator must set FIT_APPROVED or NOT_A_FIT.`);
}

async function handleDraftApplication(procurementId, agentAddress, procStruct) {
  const state = await getProcState(procurementId);
  const addr = agentAddress ?? CONFIG.AGENT_ADDRESS;
  const subdomain = CONFIG.AGENT_SUBDOMAIN;
  const merkleProof = parseMerkleProof();

  if (!addr) return result(procurementId, "BLOCKED", "AGENT_ADDRESS not set.");
  if (!subdomain) return result(procurementId, "BLOCKED", "AGENT_SUBDOMAIN not set.");

  // 1. Generate application content
  const { markdown } = await generateApplicationContent({ procurementId });

  // 2. Pin to IPFS
  const applicationURI = await pinToIpfs(markdown, `proc_${procurementId}_application`);
  if (!applicationURI) {
    return result(procurementId, "BLOCKED", "IPFS pinning failed or PINATA_JWT not set.");
  }

  // 3. Generate commitment
  const salt = generateSalt();
  const commitmentHash = computeCommitment(procurementId, addr, applicationURI, salt);

  // 4. Write application bundle
  await writeApplicationBundle(procurementId, {
    applicationMarkdown: markdown,
    applicationURI,
    commitmentSalt: salt,
    commitmentHash,
    agentAddress: addr,
    agentSubdomain: subdomain,
    merkleProof,
  });

  // 5. Build unsigned commit tx
  const { path: txPath } = await buildCommitApplicationTx({
    procurementId,
    linkedJobId: state?.linkedJobId,
    commitment: commitmentHash,
    subdomain,
    merkleProof,
    applicationArtifactPath: path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "application", "application_brief.md"),
  });

  // 6. Transition state
  await transitionProcStatus(procurementId, PROC_STATUS.APPLICATION_DRAFTED, {
    applicationURI,
    commitmentSalt: salt,
    commitmentHash,
  });

  // Also advance to COMMIT_READY since tx is built
  await transitionProcStatus(procurementId, PROC_STATUS.COMMIT_READY);

  await setProcState(procurementId, {
    txHandoffs: { commit: { path: txPath, generatedAt: new Date().toISOString() } },
  });

  return result(procurementId, "ADVANCED",
    `Application drafted, pinned to ${applicationURI}, unsigned commit tx at ${txPath}. Operator must sign.`);
}

async function handleBuildCommitTx(procurementId, procStruct) {
  const state = await getProcState(procurementId);

  // Gate check
  const gate = await checkGate(assertCommitGate, { procurementId, procStruct });
  if (!gate.passed) {
    return result(procurementId, "BLOCKED", `Commit gate failed: ${gate.failures.join("; ")}`);
  }

  // Build tx
  const { path: txPath } = await buildCommitApplicationTx({
    procurementId,
    linkedJobId: state?.linkedJobId,
    commitment: state.commitmentHash,
    subdomain: CONFIG.AGENT_SUBDOMAIN,
    merkleProof: parseMerkleProof(),
  });

  await transitionProcStatus(procurementId, PROC_STATUS.COMMIT_READY);

  return result(procurementId, "ADVANCED", `Unsigned commit tx ready at ${txPath}. Operator must sign.`);
}

async function handleBuildRevealTx(procurementId, procStruct) {
  const state = await getProcState(procurementId);

  // Load commitment material
  const appDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${procurementId}`, "application");
  const commitMaterial = await readJson(path.join(appDir, "commitment_material.json"), null);
  if (!commitMaterial) {
    return result(procurementId, "BLOCKED", "commitment_material.json missing — cannot reveal.");
  }

  // Verify commitment hash
  const recomputedHash = computeCommitment(
    procurementId,
    commitMaterial.agentAddress,
    commitMaterial.applicationURI,
    commitMaterial.salt
  );
  const verificationPassed = recomputedHash === commitMaterial.commitmentHash;

  // Write reveal bundle
  await writeRevealBundle(procurementId, {
    commitmentSalt: commitMaterial.salt,
    commitmentHash: commitMaterial.commitmentHash,
    applicationURI: commitMaterial.applicationURI,
    agentAddress: commitMaterial.agentAddress,
    agentSubdomain: CONFIG.AGENT_SUBDOMAIN,
    merkleProof: parseMerkleProof(),
    verificationPassed,
  });

  if (!verificationPassed) {
    return result(procurementId, "BLOCKED", "Commitment hash verification FAILED. Cannot reveal.");
  }

  // Gate check
  const gate = await checkGate(assertRevealGate, { procurementId, procStruct });
  if (!gate.passed) {
    return result(procurementId, "BLOCKED", `Reveal gate failed: ${gate.failures.join("; ")}`);
  }

  // Build tx
  const { path: txPath } = await buildRevealApplicationTx({
    procurementId,
    linkedJobId: state?.linkedJobId,
    subdomain: CONFIG.AGENT_SUBDOMAIN,
    merkleProof: parseMerkleProof(),
    salt: commitMaterial.salt,
    applicationURI: commitMaterial.applicationURI,
  });

  await transitionProcStatus(procurementId, PROC_STATUS.REVEAL_READY);

  return result(procurementId, "ADVANCED", `Unsigned reveal tx ready at ${txPath}. Operator must sign.`);
}

async function handleBuildFinalistTx(procurementId, procStruct) {
  const state = await getProcState(procurementId);

  // Build finalist bundle
  await writeFinalistBundle(procurementId, {
    stakeRequirements: { requiredStake: "TBD", currency: "AGIALPHA", notes: "Operator must verify stake amount" },
    trialExecutionPlan: { summary: "Execute trial deliverable within trial window", phases: ["fetch_spec", "generate", "verify", "publish", "submit"] },
  });

  // Gate check
  const gate = await checkGate(assertFinalistAcceptGate, { procurementId, procStruct });
  if (!gate.passed) {
    return result(procurementId, "BLOCKED", `Finalist gate failed: ${gate.failures.join("; ")}`);
  }

  // Build tx
  const { path: txPath } = await buildAcceptFinalistTx({
    procurementId,
    linkedJobId: state?.linkedJobId,
  });

  await transitionProcStatus(procurementId, PROC_STATUS.FINALIST_ACCEPT_READY);

  return result(procurementId, "ADVANCED", `Unsigned acceptFinalist tx ready at ${txPath}. Operator must sign.`);
}

async function handleBuildTrial(procurementId, procStruct, agentAddress) {
  const state = await getProcState(procurementId);

  // Transition to TRIAL_IN_PROGRESS if not already
  if (state.status === PROC_STATUS.FINALIST_ACCEPT_SUBMITTED) {
    await transitionProcStatus(procurementId, PROC_STATUS.TRIAL_IN_PROGRESS);
  }

  // Generate trial content
  const { markdown } = await generateTrialContent({ procurementId });

  // Pin to IPFS
  const trialURI = await pinToIpfs(markdown, `proc_${procurementId}_trial`);
  if (!trialURI) {
    return result(procurementId, "BLOCKED", "IPFS pinning failed or PINATA_JWT not set.");
  }

  // Fetchback verification
  const fetchbackVerification = await verifyFetchback(trialURI);

  // Write trial bundle
  await writeTrialBundle(procurementId, {
    trialURI,
    publicationRecord: { trialURI, pinnedAt: new Date().toISOString() },
    fetchbackVerification,
    finalMarkdown: markdown,
  });

  // Gate check
  const gate = await checkGate(assertTrialSubmitGate, { procurementId, procStruct });
  if (!gate.passed) {
    return result(procurementId, "BLOCKED", `Trial gate failed: ${gate.failures.join("; ")}`);
  }

  // Build tx
  const { path: txPath } = await buildSubmitTrialTx({
    procurementId,
    linkedJobId: state?.linkedJobId,
    trialURI,
  });

  await setProcState(procurementId, { trialURI, trialFetchback: fetchbackVerification });
  await transitionProcStatus(procurementId, PROC_STATUS.TRIAL_READY);

  return result(procurementId, "ADVANCED", `Unsigned submitTrial tx ready at ${txPath}. Operator must sign.`);
}

async function handleExecuteJob(procurementId, agentAddress) {
  const state = await getProcState(procurementId);

  // Activate the execution bridge if not done
  if (state.status === PROC_STATUS.SELECTED) {
    await activateBridge({
      procurementId,
      agentAddress,
      selectionBlock: state.selectionBlock,
    });
  }

  // Fetch linked job spec
  if (state?.linkedJobId && CONFIG.AGI_ALPHA_MCP) {
    await fetchLinkedJobSpec({ procurementId, linkedJobId: state.linkedJobId });
  }

  return result(procurementId, "ADVANCED",
    `Execution bridge activated for job #${state.linkedJobId}. ` +
    `Use v1 pipeline (execute.js/submit.js) or call recordLinkedJobCompletion() when done.`);
}

async function handleBuildCompletionTx(procurementId, state) {
  // Gate check
  const gate = await checkGate(assertCompletionGate, { procurementId });
  if (!gate.passed) {
    return result(procurementId, "BLOCKED", `Completion gate failed: ${gate.failures.join("; ")}`);
  }

  const { path: txPath } = await buildRequestJobCompletionTx({
    procurementId,
    linkedJobId: state.linkedJobId,
    completionURI: state.completionURI,
    agentSubdomain: CONFIG.AGENT_SUBDOMAIN,
  });

  await transitionProcStatus(procurementId, PROC_STATUS.COMPLETION_READY);

  return result(procurementId, "ADVANCED", `Unsigned requestJobCompletion tx ready at ${txPath}. Operator must sign.`);
}

// ── Deterministic fit evaluation ─────────────────────────────────────────────

function evaluateFitDeterministic(procurementId, jobSpec, procSnapshot) {
  const checklist = [];
  let score = 0;
  let maxScore = 0;

  // Check 1: Job spec available
  maxScore += 1;
  if (jobSpec && Object.keys(jobSpec).length > 0) {
    score += 1;
    checklist.push({ check: "job_spec_available", passed: true });
  } else {
    checklist.push({ check: "job_spec_available", passed: false, note: "No job spec available" });
  }

  // Check 2: Deliverable type is not image/design
  maxScore += 1;
  const category = (jobSpec?.category ?? jobSpec?.properties?.category ?? "").toLowerCase();
  const tags = (jobSpec?.tags ?? jobSpec?.properties?.tags ?? []).map(t => String(t).toLowerCase());
  const imageBlocked = ["design", "logo", "illustration", "image"].some(t => category.includes(t) || tags.includes(t));
  if (!imageBlocked) {
    score += 1;
    checklist.push({ check: "deliverable_type_supported", passed: true });
  } else {
    checklist.push({ check: "deliverable_type_supported", passed: false, note: "Image/design jobs not supported" });
  }

  // Check 3: Chain phase allows participation
  maxScore += 1;
  const chainPhase = procSnapshot?.chainPhase;
  if (chainPhase === CHAIN_PHASE.COMMIT_OPEN || chainPhase === CHAIN_PHASE.REVEAL_OPEN) {
    score += 1;
    checklist.push({ check: "chain_phase_open", passed: true });
  } else {
    checklist.push({ check: "chain_phase_open", passed: false, note: `Chain phase is ${chainPhase}` });
  }

  // Check 4: Payout meets minimum
  maxScore += 1;
  const payout = Number(jobSpec?.payout ?? jobSpec?.properties?.payout ?? 0);
  if (payout >= CONFIG.MIN_PAYOUT_AGIALPHA || payout === 0) {
    score += 1;
    checklist.push({ check: "payout_minimum", passed: true });
  } else {
    checklist.push({ check: "payout_minimum", passed: false, note: `Payout ${payout} < min ${CONFIG.MIN_PAYOUT_AGIALPHA}` });
  }

  const normalizedScore = maxScore > 0 ? score / maxScore : 0;
  const decision = normalizedScore >= CONFIG.MIN_CONFIDENCE_TO_APPLY ? "PASS" : "FAIL";
  const warnings = imageBlocked ? ["Image/design job — outside LLM capability"] : [];

  return {
    procurementId: String(procurementId),
    score: normalizedScore,
    rawScore: score,
    maxScore,
    decision,
    checklist,
    warnings,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── IPFS pinning helper ──────────────────────────────────────────────────────

async function pinToIpfs(content, name) {
  const jwt = CONFIG.PINATA_JWT;
  if (!jwt) {
    log("PINATA_JWT not set — cannot pin to IPFS");
    return null;
  }

  try {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: { content, generatedAt: new Date().toISOString() },
        pinataMetadata: { name },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Pinata HTTP ${res.status}`);
    const data = await res.json();
    return `ipfs://${data.IpfsHash}`;
  } catch (err) {
    log(`IPFS pin failed: ${err.message}`);
    return null;
  }
}

// ── Fetchback verification helper ────────────────────────────────────────────

async function verifyFetchback(ipfsUri) {
  if (!ipfsUri) return { verified: false, error: "No URI provided" };

  const cid = ipfsUri.replace("ipfs://", "");
  const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;

  try {
    const res = await fetch(gatewayUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return { verified: false, uri: ipfsUri, gatewayUrl, httpStatus: res.status, fetchedAt: new Date().toISOString() };
    }
    await res.text();
    return { verified: true, uri: ipfsUri, gatewayUrl, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { verified: false, uri: ipfsUri, gatewayUrl, error: err.message, fetchedAt: new Date().toISOString() };
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function parseMerkleProof() {
  const raw = process.env.AGENT_MERKLE_PROOF ?? "[]";
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function result(procurementId, outcome, message, extra = {}) {
  return {
    procurementId: String(procurementId),
    outcome,
    message,
    at: new Date().toISOString(),
    ...extra,
  };
}

function log(msg) {
  console.log(`[prime-orchestrator] ${new Date().toISOString()} ${msg}`);
}
