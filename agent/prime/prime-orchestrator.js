// prime/prime-orchestrator.js
// Prime procurement orchestrator — the action layer.
//
// The monitoring loop (prime-monitor.js) observes chain state and writes:
//   - artifacts/proc_<id>/chain_snapshot.json
//   - artifacts/proc_<id>/next_action.json
//
// This orchestrator reads those outputs and acts:
//   - executes the indicated next action
//   - advances PROC_STATUS via transitionProcStatus()
//   - stops at operator handoff points (tx packages ready for signing)
//   - handles crash recovery on startup
//
// Operator handoff stops (process pauses, operator signs with Ledger):
//   COMMIT_READY              → sign application/unsigned_commit_tx.json
//   REVEAL_READY              → sign reveal/unsigned_reveal_tx.json
//   FINALIST_ACCEPT_READY     → sign finalist/unsigned_accept_finalist_tx.json
//   TRIAL_READY               → sign trial/unsigned_submit_trial_tx.json
//   COMPLETION_READY          → sign completion/unsigned_completion_tx.json
//
// SAFETY CONTRACT:
//   - NO private keys. NO signing. NO broadcasting.
//   - Every tx package is written to disk for operator review.
//   - All status transitions go through transitionProcStatus() with validation.
//   - One LLM call per procurement maximum (not currently wired; placeholder preserved).

import path from "path";
import { randomBytes, createHash } from "crypto";
import { startPrimeMonitor, printMonitorSummary } from "../prime-monitor.js";
import {
  fetchProcurement,
  fetchApplicationView,
  computeCommitment,
  generateSalt,
  getCurrentBlock,
  fetchErc20Allowance,
  fetchErc20Balance,
  PRIME_CONTRACT,
} from "../prime-client.js";
import { PROC_STATUS, TERMINAL_STATUSES, deriveChainPhase, CHAIN_PHASE, didMissRequiredWindow, toCanonicalPhase } from "../prime-phase-model.js";
import {
  getProcState,
  setProcState,
  transitionProcStatus,
  listActiveProcurements,
  readJson,
  writeJson,
  procRootDir,
  procSubdir,
  ensureProcSubdir,
  writeProcCheckpoint,
} from "../prime-state.js";
import {
  writeInspectionExtras,
  writeApplicationBundle,
  writeRevealBundle,
  writeFinalistBundle,
  writeTrialBundle,
  writeCompletionBundle,
} from "../prime-artifact-builder.js";
import {
  buildCommitApplicationTx,
  buildRevealApplicationTx,
  buildAcceptFinalistTx,
  buildSubmitTrialTx,
  buildApproveAgialphaTx,
} from "../prime-tx-builder.js";
import {
  assertCommitGate,
  assertRevealGate,
  assertFinalistAcceptGate,
  assertTrialSubmitGate,
} from "../prime-review-gates.js";
import { activateBridge } from "../prime-execution-bridge.js";
import { createRetrievalPacket, extractSteppingStone, extractSearchKeywords } from "../prime-retrieval.js";
import { evaluateFit } from "./prime-evaluate.js";
import { generateApplicationMarkdown, generateTrialMarkdown, publishAndVerify, draftWithLLM } from "./prime-content.js";

// ── Config ────────────────────────────────────────────────────────────────────

const AGENT_ADDRESS   = (process.env.AGENT_ADDRESS    ?? "").toLowerCase();
const AGENT_SUBDOMAIN =  process.env.AGENT_SUBDOMAIN  ?? "";
const MERKLE_PROOF    =  JSON.parse(process.env.AGENT_MERKLE_PROOF ?? "[]");
const POLL_INTERVAL_MS = Number(process.env.PRIME_POLL_INTERVAL_MS ?? "60000");
const FINALIST_STAKE_TOPUP_WEI = BigInt(process.env.PRIME_FINALIST_STAKE_TOPUP_WEI ?? "0");

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[prime-orchestrator] ${new Date().toISOString()} ${msg}`);
}

function logError(msg, err) {
  console.error(`[prime-orchestrator] ${new Date().toISOString()} ERROR ${msg}: ${err?.message ?? err}`);
}

// ── Crash recovery ────────────────────────────────────────────────────────────
// On restart, reconcile local PROC_STATUS against fresh chain reads.
// Corrects obvious discrepancies (e.g. local=COMMIT_SUBMITTED but chain shows no commit).

async function recoverProcurement(procurementId) {
  const state = await getProcState(procurementId);
  if (!state) return;

  let procStruct, appView;
  try {
    procStruct = await fetchProcurement(procurementId);
    appView    = AGENT_ADDRESS ? await fetchApplicationView(procurementId, AGENT_ADDRESS) : null;
  } catch (err) {
    logError(`recovery chain read #${procurementId}`, err);
    return;
  }

  const chainPhase   = deriveChainPhase(procStruct);
  const onChainPhase = Number(appView?.applicationPhase ?? 0);
  // on-chain applicationPhase: 0=None 1=Committed 2=Revealed 3=Shortlisted 4=TrialSubmitted

  let correction = null;

  if (didMissRequiredWindow(state.status, chainPhase)) {
    correction = { newStatus: PROC_STATUS.MISSED_WINDOW, note: `Missed required ${chainPhase} window while in ${state.status}` };
  } else if (chainPhase === CHAIN_PHASE.CLOSED && !TERMINAL_STATUSES.has(state.status)) {
    correction = { newStatus: PROC_STATUS.EXPIRED, note: "Chain closed — all deadlines passed" };
  } else if (state.status === PROC_STATUS.COMMIT_SUBMITTED && onChainPhase < 1) {
    // We thought we submitted but chain shows no commit.
    correction = { newStatus: PROC_STATUS.COMMIT_READY, note: "On-chain commit not found; rolled back to COMMIT_READY" };
  } else if (state.status === PROC_STATUS.REVEAL_SUBMITTED && onChainPhase < 2) {
    if (onChainPhase >= 1) {
      correction = { newStatus: PROC_STATUS.REVEAL_READY, note: "On-chain reveal not found; rolled back to REVEAL_READY" };
    } else {
      correction = { newStatus: PROC_STATUS.COMMIT_READY, note: "On-chain commit not found; rolled back to COMMIT_READY" };
    }
  } else if (state.status === PROC_STATUS.FINALIST_ACCEPT_SUBMITTED && onChainPhase < 3) {
    if (appView?.shortlisted) {
      correction = { newStatus: PROC_STATUS.FINALIST_ACCEPT_READY, note: "Accept not on chain; rolled back" };
    }
  }

  if (correction) {
    log(`#${procurementId} recovery: ${correction.note}`);
    try {
      await transitionProcStatus(procurementId, correction.newStatus, { recoveryNote: correction.note });
    } catch (err) {
      // If transition is invalid (e.g. already terminal), just patch.
      await setProcState(procurementId, { recoveryNote: correction.note });
    }
  }
}

export async function recoverAll() {
  const active = await listActiveProcurements();
  log(`Recovery check: ${active.length} active procurement(s)`);
  for (const s of active) {
    await recoverProcurement(s.procurementId).catch(err =>
      logError(`recovery #${s.procurementId}`, err)
    );
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────
// Each handler maps to a next_action.action value.
// Returns true if state advanced, false if blocked.

async function handleInspect(procurementId) {
  // prime-monitor already ran inspection (inspectProcurement) when the procurement
  // was discovered. If DISCOVERED is still the status, the monitor hasn't run yet
  // — nothing to do here; wait for next monitor cycle.
  log(`#${procurementId}: waiting for monitor to complete initial inspection`);
  return false;
}

async function handleEvaluateFit(procurementId, procStruct, jobSpec) {
  log(`#${procurementId}: evaluating fit`);

  // Build retrieval packet for context.
  let retrievalPacket = null;
  try {
    retrievalPacket = await createRetrievalPacket({
      procurementId,
      phase:          "application",
      keywords:       extractSearchKeywords(jobSpec),
    });
  } catch (err) {
    log(`#${procurementId}: retrieval packet failed (non-fatal): ${err.message}`);
  }

  const fitEvaluation = evaluateFit({ procurementId, jobSpec, procStruct });

  // Write fit evaluation as inspection extra artifact.
  try {
    await writeInspectionExtras(procurementId, {
      normalizedJobSpec: typeof jobSpec === "object" ? jobSpec : { raw: jobSpec },
      fitEvaluation,
    });
  } catch (err) {
    logError(`#${procurementId}: writeInspectionExtras`, err);
  }

  if (fitEvaluation.decision === "FAIL") {
    await transitionProcStatus(procurementId, PROC_STATUS.NOT_A_FIT, {
      fitDecisionAt: new Date().toISOString(),
      fitApproved: false,
    });
    log(`#${procurementId}: → NOT_A_FIT (score=${fitEvaluation.score.toFixed(3)} — ${fitEvaluation.reason})`);
  } else {
    await transitionProcStatus(procurementId, PROC_STATUS.FIT_APPROVED, {
      fitDecisionAt: new Date().toISOString(),
      fitApproved: true,
    });
    log(`#${procurementId}: → FIT_APPROVED (score=${fitEvaluation.score.toFixed(3)})`);
  }
  return true;
}

async function handleDraftApplication(procurementId, procStruct, jobSpec) {
  log(`#${procurementId}: drafting application`);

  const state = await getProcState(procurementId);

  // Build retrieval packet.
  let retrievalPacket = null;
  try {
    retrievalPacket = await createRetrievalPacket({
      procurementId,
      phase:          "application",
      keywords:       extractSearchKeywords(jobSpec),
    });
  } catch (err) {
    log(`#${procurementId}: retrieval packet failed (non-fatal): ${err.message}`);
  }

  // Generate application markdown — attempt LLM draft, fall back to template.
  const fitEvaluation = await readJson(
    path.join(procSubdir(procurementId, "inspection"), "fit_evaluation.json"),
    null
  );
  let llmDraft = null;
  if ((state.llmCallsUsed ?? 0) < 1) {
    try {
      llmDraft = await draftWithLLM({ phase: "application", procurementId, jobSpec, fitEvaluation, retrievalPacket });
      await setProcState(procurementId, {
        llmCallsUsed: (state.llmCallsUsed ?? 0) + 1,
        llmDraftedAt: new Date().toISOString(),
      });
      log(`#${procurementId}: LLM application draft produced (${llmDraft.length} chars)`);
    } catch (err) {
      log(`#${procurementId}: LLM draft unavailable (${err.message}), using template`);
    }
  } else {
    log(`#${procurementId}: LLM budget already consumed for this procurement; using deterministic template`);
  }
  const applicationMarkdown = generateApplicationMarkdown({
    procurementId,
    jobSpec,
    fitEvaluation,
    agentAddress:   AGENT_ADDRESS,
    agentSubdomain: AGENT_SUBDOMAIN,
    retrievalPacket,
    llmDraft,
  });

  // Publish to IPFS.
  const { ipfsHash, uri: applicationURI, gatewayURL, pinnedAt, fetchback } =
    await publishAndVerify(applicationMarkdown, `application_${procurementId}.md`);

  if (!fetchback.verified) {
    log(`#${procurementId}: WARNING — IPFS fetchback verification failed for application. Proceeding anyway.`);
  }

  // Generate salt + compute commitment.
  const commitmentSalt = generateSalt();
  const commitmentHash = computeCommitment(
    procurementId,
    AGENT_ADDRESS,
    applicationURI,
    commitmentSalt
  );

  // Write application bundle.
  await writeApplicationBundle(procurementId, {
    applicationMarkdown,
    applicationURI,
    commitmentSalt,
    commitmentHash,
    agentAddress:   AGENT_ADDRESS,
    agentSubdomain: AGENT_SUBDOMAIN,
    merkleProof:    MERKLE_PROOF,
  });

  // Persist material to state.
  await setProcState(procurementId, {
    applicationURI,
    commitmentSalt,
    commitmentHash,
  });

  await transitionProcStatus(procurementId, PROC_STATUS.APPLICATION_DRAFTED);
  log(`#${procurementId}: → APPLICATION_DRAFTED (applicationURI=${applicationURI})`);

  // Extract stepping stone from completed application draft.
  try {
    const title = (typeof jobSpec === "object" ? jobSpec?.title : null) ?? `Procurement #${procurementId}`;
    await extractSteppingStone({
      source:  "prime",
      procurementId,
      phase:   "application",
      artifactPath: path.join(procSubdir(procurementId, "application"), "application_brief.md"),
      metadata: {
        domain: typeof jobSpec === "object" ? (jobSpec?.domain ?? jobSpec?.category ?? "general") : "general",
        deliverableType: typeof jobSpec === "object" ? (jobSpec?.category ?? "application") : "application",
        timestamp: new Date().toISOString(),
      },
      primitive: {
        applicationURI,
        agentSubdomain:  AGENT_SUBDOMAIN,
        fitScore:        fitEvaluation?.score ?? null,
        contentLength:   applicationMarkdown.length,
        contentSample:   applicationMarkdown.slice(0, 400),
        artifactPath:    path.join(procSubdir(procurementId, "application"), "application_brief.md"),
      },
      title:   `Application: ${title}`,
      summary: `Application for procurement #${procurementId}. Fit score: ${fitEvaluation?.score?.toFixed(3) ?? "n/a"}.`,
      tags:    ["application", "procurement", ...extractSearchKeywords(jobSpec).slice(0, 5)],
    });
    log(`#${procurementId}: stepping stone extracted for application`);
  } catch (err) {
    log(`#${procurementId}: stepping stone extraction failed (non-fatal): ${err.message}`);
  }

  return true;
}

async function handleBuildCommitTx(procurementId, procStruct) {
  log(`#${procurementId}: building commit tx`);
  const state = await getProcState(procurementId);

  // Gate check.
  try {
    await assertCommitGate({ procurementId, procStruct });
  } catch (err) {
    log(`#${procurementId}: commit gate failed — ${err.message}`);
    return false;
  }

  const { path: txPath } = await buildCommitApplicationTx({
    procurementId,
    linkedJobId:            state.linkedJobId,
    commitment:             state.commitmentHash,
    subdomain:              AGENT_SUBDOMAIN,
    merkleProof:            MERKLE_PROOF,
    applicationArtifactPath: path.join(procSubdir(procurementId, "application"), "application_brief.md"),
  });

  await transitionProcStatus(procurementId, PROC_STATUS.COMMIT_READY, {
    canonicalPhase: toCanonicalPhase(PROC_STATUS.COMMIT_READY),
    txHandoffs: { ...state.txHandoffs, commitApplication: txPath },
  });

  await writeReadyPacket(procurementId, "commitApplication", txPath);

  log(`#${procurementId}: → COMMIT_READY`);
  log(`  OPERATOR ACTION: review and sign ${txPath}`);
  return true;
}

async function handleWaitRevealWindow(procurementId, procStruct) {
  // Detect if commit has landed on-chain since last check.
  if (!AGENT_ADDRESS) return false;
  const appView = await fetchApplicationView(procurementId, AGENT_ADDRESS);
  if (Number(appView?.applicationPhase ?? 0) >= 1) {
    await transitionProcStatus(procurementId, PROC_STATUS.COMMIT_SUBMITTED, {
      commitTxHash: appView.commitment, // not the tx hash but confirms it's on chain
    });
    log(`#${procurementId}: on-chain commit confirmed → COMMIT_SUBMITTED`);
    return true;
  }
  log(`#${procurementId}: COMMIT_READY — waiting for operator to sign commit tx`);
  return false;
}

async function handleBuildRevealTx(procurementId, procStruct) {
  log(`#${procurementId}: building reveal tx`);
  const state = await getProcState(procurementId);
  const chainPhase = deriveChainPhase(procStruct);

  if (chainPhase !== CHAIN_PHASE.REVEAL_OPEN) {
    log(`#${procurementId}: reveal window not yet open (chainPhase=${chainPhase})`);
    return false;
  }

  // Verify commitment locally before building reveal.
  const recomputed = computeCommitment(
    procurementId,
    AGENT_ADDRESS,
    state.applicationURI,
    state.commitmentSalt
  );
  const verificationPassed = recomputed.toLowerCase() === (state.commitmentHash ?? "").toLowerCase();

  // Write reveal bundle.
  await writeRevealBundle(procurementId, {
    commitmentSalt:     state.commitmentSalt,
    commitmentHash:     state.commitmentHash,
    applicationURI:     state.applicationURI,
    agentAddress:       AGENT_ADDRESS,
    agentSubdomain:     AGENT_SUBDOMAIN,
    merkleProof:        MERKLE_PROOF,
    verificationPassed,
  });

  if (!verificationPassed) {
    log(`#${procurementId}: ERROR — commitment verification FAILED. Reveal NOT built.`);
    await setProcState(procurementId, {
      error: "Commitment verification failed: recomputed hash does not match stored commitmentHash"
    });
    return false;
  }

  // Gate check.
  try {
    await assertRevealGate({ procurementId, procStruct });
  } catch (err) {
    log(`#${procurementId}: reveal gate failed — ${err.message}`);
    return false;
  }

  const { path: txPath } = await buildRevealApplicationTx({
    procurementId,
    linkedJobId:    state.linkedJobId,
    subdomain:      AGENT_SUBDOMAIN,
    merkleProof:    MERKLE_PROOF,
    salt:           state.commitmentSalt,
    applicationURI: state.applicationURI,
  });

  await transitionProcStatus(procurementId, PROC_STATUS.REVEAL_READY, {
    canonicalPhase: toCanonicalPhase(PROC_STATUS.REVEAL_READY),
    txHandoffs: { ...state.txHandoffs, revealApplication: txPath },
  });
  await writeReadyPacket(procurementId, "revealApplication", txPath);

  log(`#${procurementId}: → REVEAL_READY`);
  log(`  OPERATOR ACTION: review and sign ${txPath}`);
  return true;
}

async function handleWaitShortlist(procurementId) {
  // Monitor handles shortlist detection — when state.shortlisted is set by the
  // monitor, we detect that here and advance to FINALIST_ACCEPT_READY.
  const state = await getProcState(procurementId);

  if (!AGENT_ADDRESS) return false;

  // Also check on-chain applicationView directly for freshness.
  const appView = await fetchApplicationView(procurementId, AGENT_ADDRESS);
  const onChainPhase = Number(appView?.applicationPhase ?? 0);

  if (appView?.shortlisted || onChainPhase >= 3) {
    // Mark shortlisted if not already done.
    if (!state.shortlisted) {
      await setProcState(procurementId, { shortlisted: true });
    }
    await transitionProcStatus(procurementId, PROC_STATUS.SHORTLISTED);
    log(`#${procurementId}: → SHORTLISTED (on-chain confirmation)`);
    return true;
  }

  // Check if reveal was submitted (on-chain phase >= 2) but shortlist not yet finalized.
  if (onChainPhase >= 2) {
    // Confirm reveal is on chain; advance REVEAL_SUBMITTED if still REVEAL_READY.
    if (state.status === PROC_STATUS.REVEAL_READY) {
      await transitionProcStatus(procurementId, PROC_STATUS.REVEAL_SUBMITTED);
      log(`#${procurementId}: → REVEAL_SUBMITTED (on-chain reveal confirmed)`);
      return true;
    }
    log(`#${procurementId}: REVEAL_SUBMITTED — waiting for ShortlistFinalized event`);
    return false;
  }

  log(`#${procurementId}: REVEAL_READY — waiting for operator to sign reveal tx`);
  return false;
}

async function handleBuildFinalistTx(procurementId, procStruct) {
  log(`#${procurementId}: building finalist accept tx`);
  const state = await getProcState(procurementId);

  // Gate check.
  try {
    await assertFinalistAcceptGate({ procurementId, procStruct });
  } catch (err) {
    log(`#${procurementId}: finalist accept gate failed — ${err.message}`);
    return false;
  }

  const balanceWei = BigInt(await fetchErc20Balance(AGENT_ADDRESS));
  const allowanceWei = BigInt(await fetchErc20Allowance(AGENT_ADDRESS, PRIME_CONTRACT));
  const requiredTopUpWei = FINALIST_STAKE_TOPUP_WEI;
  const hasSufficientBalance = balanceWei >= requiredTopUpWei;
  const allowanceSufficient = allowanceWei >= requiredTopUpWei;

  if (!hasSufficientBalance) {
    log(`#${procurementId}: insufficient AGIALPHA balance for finalist top-up`);
    await setProcState(procurementId, { lastError: "Insufficient AGIALPHA balance for finalist top-up" });
    return false;
  }

  let approveTxPath = null;
  if (!allowanceSufficient && requiredTopUpWei > 0n) {
    const approve = await buildApproveAgialphaTx({
      procurementId,
      linkedJobId: state.linkedJobId,
      spender: PRIME_CONTRACT,
      amountWei: requiredTopUpWei.toString(),
    });
    approveTxPath = approve.path;
  }

  // Write finalist bundle.
  await writeFinalistBundle(procurementId, {
    stakeRequirements: { requiredStake: requiredTopUpWei.toString(), currency: "AGIAlpha", notes: "Computed preflight requirement" },
    trialExecutionPlan: {
      approach: "Artifact-first trial production: generate structured markdown deliverable, publish to IPFS, submit trialURI on-chain.",
      estimatedArtifacts: ["trial/trial_deliverable.md", "trial/publication_record.json"],
    },
  });
  await writeJson(path.join(procSubdir(procurementId, "finalist"), "stake_preflight.json"), {
    procurementId: String(procurementId),
    requiredTopUpWei: requiredTopUpWei.toString(),
    balanceWei: balanceWei.toString(),
    allowanceWei: allowanceWei.toString(),
    hasSufficientBalance,
    allowanceSufficient,
    needsApproval: !allowanceSufficient && requiredTopUpWei > 0n,
    unsignedApprovalTx: approveTxPath,
    checkedAt: new Date().toISOString(),
  });

  const { path: txPath } = await buildAcceptFinalistTx({
    procurementId,
    linkedJobId: state.linkedJobId,
  });

  await transitionProcStatus(procurementId, PROC_STATUS.FINALIST_ACCEPT_READY, {
    canonicalPhase: toCanonicalPhase(PROC_STATUS.FINALIST_ACCEPT_READY),
    txHandoffs: { ...state.txHandoffs, acceptFinalist: txPath },
  });
  await writeReadyPacket(procurementId, "acceptFinalist", txPath);

  log(`#${procurementId}: → FINALIST_ACCEPT_READY`);
  log(`  OPERATOR ACTION: review and sign ${txPath}`);
  return true;
}

async function handleBuildTrial(procurementId, procStruct, jobSpec) {
  log(`#${procurementId}: building trial artifacts`);
  const state = await getProcState(procurementId);

  // Confirm finalist accept landed on-chain.
  if (AGENT_ADDRESS) {
    const appView = await fetchApplicationView(procurementId, AGENT_ADDRESS);
    if (Number(appView?.applicationPhase ?? 0) < 4) {
      // Accept not yet on chain; check if we need to advance FINALIST_ACCEPT_SUBMITTED.
      if (Number(appView?.applicationPhase ?? 0) >= 3 &&
          state.status === PROC_STATUS.FINALIST_ACCEPT_READY) {
        await transitionProcStatus(procurementId, PROC_STATUS.FINALIST_ACCEPT_SUBMITTED);
        log(`#${procurementId}: → FINALIST_ACCEPT_SUBMITTED`);
      }
      log(`#${procurementId}: FINALIST_ACCEPT_READY — waiting for operator to sign acceptFinalist tx`);
      return false;
    }
    if (state.status === PROC_STATUS.FINALIST_ACCEPT_SUBMITTED) {
      await transitionProcStatus(procurementId, PROC_STATUS.TRIAL_IN_PROGRESS);
      log(`#${procurementId}: → TRIAL_IN_PROGRESS (on-chain accept confirmed)`);
    }
  }

  // Build retrieval packet.
  let retrievalPacket = null;
  try {
    retrievalPacket = await createRetrievalPacket({
      procurementId,
      phase:          "trial",
      keywords:       extractSearchKeywords(jobSpec),
    });
  } catch (err) {
    log(`#${procurementId}: retrieval packet failed (non-fatal): ${err.message}`);
  }

  // Generate trial content — attempt LLM draft, fall back to template.
  let llmTrialDraft = null;
  if ((state.llmCallsUsed ?? 0) < 1) {
    try {
      llmTrialDraft = await draftWithLLM({ phase: "trial", procurementId, jobSpec, retrievalPacket });
      await setProcState(procurementId, {
        llmCallsUsed: (state.llmCallsUsed ?? 0) + 1,
        llmDraftedAt: new Date().toISOString(),
      });
      log(`#${procurementId}: LLM trial draft produced (${llmTrialDraft.length} chars)`);
    } catch (err) {
      log(`#${procurementId}: LLM draft unavailable (${err.message}), using template`);
    }
  } else {
    log(`#${procurementId}: LLM budget already consumed for this procurement; using deterministic template`);
  }
  const trialMarkdown = generateTrialMarkdown({
    procurementId,
    jobSpec,
    retrievalPacket,
    llmDraft: llmTrialDraft,
  });

  // Publish to IPFS + fetchback verify.
  const { ipfsHash, uri: trialURI, gatewayURL, pinnedAt, fetchback } =
    await publishAndVerify(trialMarkdown, `trial_${procurementId}.md`);

  // Write trial bundle.
  await writeTrialBundle(procurementId, {
    trialURI,
    publicationRecord:    { pinataHash: ipfsHash, gatewayURL, pinnedAt },
    fetchbackVerification: fetchback,
    retrievalPacket,
    decompositionPlan: { procurementId: String(procurementId), steps: ["spec-fetch", "outline", "draft", "verify", "publish"] },
    validatorPacket: { procurementId: String(procurementId), checks: ["schema-complete", "ipfs-fetchback", "deadline-window"] },
    draftMarkdown: trialMarkdown,
    finalMarkdown: trialMarkdown,
  });

  if (!fetchback.verified) {
    log(`#${procurementId}: WARNING — IPFS fetchback verification failed. Proceeding with TRIAL_READY anyway.`);
  }

  // Update state.
  await setProcState(procurementId, {
    trialURI,
    trialFetchback: fetchback,
    trialArtifactDir: procSubdir(procurementId, "trial"),
  });

  // Extract stepping stone from completed trial artifact.
  try {
    const title = (typeof jobSpec === "object" ? jobSpec?.title : null) ?? `Procurement #${procurementId}`;
    const deliverableType = (typeof jobSpec === "object" ? jobSpec?.category : null) ?? "artifact-bundle";
    await extractSteppingStone({
      source:  "prime",
      procurementId,
      phase:   "trial",
      artifactPath: path.join(procSubdir(procurementId, "trial"), "final.md"),
      metadata: {
        domain: typeof jobSpec === "object" ? (jobSpec?.domain ?? jobSpec?.category ?? "general") : "general",
        deliverableType,
        timestamp: new Date().toISOString(),
      },
      primitive: {
        trialURI,
        deliverableType,
        fetchbackVerified: fetchback.verified,
        contentLength:     trialMarkdown.length,
        contentSample:     trialMarkdown.slice(0, 400),
        artifactPath:      path.join(procSubdir(procurementId, "trial"), "final.md"),
      },
      title:   `Trial: ${title}`,
      summary: `Trial artifact for procurement #${procurementId}. Type: ${deliverableType}.`,
      tags:    ["trial", "procurement", deliverableType, ...extractSearchKeywords(jobSpec).slice(0, 5)],
    });
    log(`#${procurementId}: stepping stone extracted for trial`);
  } catch (err) {
    log(`#${procurementId}: stepping stone extraction failed (non-fatal): ${err.message}`);
  }

  return true; // caller (handleBuildTrialTx) continues immediately
}

async function handleBuildTrialTx(procurementId, procStruct) {
  log(`#${procurementId}: building submitTrial tx`);
  const state = await getProcState(procurementId);

  if (!state.trialURI) {
    log(`#${procurementId}: trial not yet published — run BUILD_TRIAL first`);
    return false;
  }

  // Gate check.
  try {
    await assertTrialSubmitGate({ procurementId, procStruct });
  } catch (err) {
    log(`#${procurementId}: trial submit gate failed — ${err.message}`);
    return false;
  }

  const { path: txPath } = await buildSubmitTrialTx({
    procurementId,
    linkedJobId: state.linkedJobId,
    trialURI:    state.trialURI,
  });

  await transitionProcStatus(procurementId, PROC_STATUS.TRIAL_READY, {
    canonicalPhase: toCanonicalPhase(PROC_STATUS.TRIAL_READY),
    txHandoffs: { ...state.txHandoffs, submitTrial: txPath },
  });
  await writeReadyPacket(procurementId, "submitTrial", txPath);

  log(`#${procurementId}: → TRIAL_READY`);
  log(`  OPERATOR ACTION: review and sign ${txPath}`);
  return true;
}

async function handleExecuteJob(procurementId) {
  log(`#${procurementId}: activating execution bridge (SELECTED → JOB_EXECUTION_IN_PROGRESS)`);
  const state = await getProcState(procurementId);

  try {
    await activateBridge(procurementId, state.linkedJobId);
    await transitionProcStatus(procurementId, PROC_STATUS.JOB_EXECUTION_IN_PROGRESS);
    log(`#${procurementId}: → JOB_EXECUTION_IN_PROGRESS`);
    return true;
  } catch (err) {
    logError(`#${procurementId}: activateBridge`, err);
    return false;
  }
}

// ── Per-procurement orchestration cycle ──────────────────────────────────────

export async function orchestrateProcurement(procurementId) {
  const state = await getProcState(procurementId);
  if (!state) return;
  if (TERMINAL_STATUSES.has(state.status)) return;

  // Load next_action.json written by the monitor.
  const nextActionPath = path.join(procRootDir(procurementId), "next_action.json");
  const nextAction = await readJson(nextActionPath, null);
  const action = nextAction?.action ?? "NONE";

  // Fetch fresh chain data.
  let procStruct = null;
  try {
    procStruct = await fetchProcurement(procurementId);
  } catch (err) {
    logError(`#${procurementId}: fetchProcurement`, err);
    return;
  }

  // Fetch job spec if we have a jobSpecURI in the linked job snapshot.
  const jobSnapshotPath = path.join(procRootDir(procurementId), "inspection", "linked_job_snapshot.json");
  const jobSnapshot  = await readJson(jobSnapshotPath, null);
  const jobSpec      = jobSnapshot?.jobSpec ?? jobSnapshot ?? null;

  log(`#${procurementId}: status=${state.status} action=${action}`);

  try {
    switch (action) {
      case "INSPECT":                await handleInspect(procurementId);                           break;
      case "EVALUATE_FIT":           await handleEvaluateFit(procurementId, procStruct, jobSpec);  break;
      case "DRAFT_APPLICATION":      await handleDraftApplication(procurementId, procStruct, jobSpec); break;
      case "BUILD_COMMIT_TX":        await handleBuildCommitTx(procurementId, procStruct);         break;
      case "WAIT_REVEAL_WINDOW":     await handleWaitRevealWindow(procurementId, procStruct);      break;
      case "BUILD_REVEAL_TX":        await handleBuildRevealTx(procurementId, procStruct);         break;
      case "WAIT_SHORTLIST":         await handleWaitShortlist(procurementId);                     break;
      case "CHECK_SHORTLIST":        await handleWaitShortlist(procurementId);                     break;
      case "BUILD_FINALIST_TX":      await handleBuildFinalistTx(procurementId, procStruct);       break;
      case "BUILD_TRIAL": {
        const built = await handleBuildTrial(procurementId, procStruct, jobSpec);
        if (built) await handleBuildTrialTx(procurementId, procStruct);
        break;
      }
      case "BUILD_TRIAL_TX":         await handleBuildTrialTx(procurementId, procStruct);          break;
      case "WAIT_SCORING":
        // Detect if trial was submitted on-chain.
        if (AGENT_ADDRESS) {
          const appView = await fetchApplicationView(procurementId, AGENT_ADDRESS);
          if (Number(appView?.applicationPhase ?? 0) >= 4 &&
              state.status === PROC_STATUS.TRIAL_READY) {
            await transitionProcStatus(procurementId, PROC_STATUS.TRIAL_SUBMITTED);
            await transitionProcStatus(procurementId, PROC_STATUS.WAITING_SCORE_PHASE);
            log(`#${procurementId}: → WAITING_SCORE_PHASE (trial on-chain confirmed)`);
          } else {
            log(`#${procurementId}: TRIAL_READY — waiting for operator to sign submitTrial tx`);
          }
        }
        break;
      case "CHECK_WINNER":
        log(`#${procurementId}: WAITING_SCORE_PHASE — monitoring for winner designation`);
        break;
      case "EXECUTE_JOB":
        if (state.status === PROC_STATUS.SELECTED) {
          await handleExecuteJob(procurementId);
        }
        break;
      case "BUILD_COMPLETION_TX":
        log(`#${procurementId}: COMPLETION_READY — refer to prime-execution-bridge for completion tx`);
        break;
      case "TERMINAL":
        // Nothing to do — already terminal.
        break;
      default:
        log(`#${procurementId}: unhandled action '${action}' (status=${state.status})`);
    }
  } catch (err) {
    logError(`#${procurementId}: action=${action}`, err);
    await setProcState(procurementId, { lastError: err.message }).catch(() => {});
  }
}

// ── Operator status report ────────────────────────────────────────────────────

async function printOrchestratorReport() {
  const active = await listActiveProcurements();
  const HANDOFF_STATUSES = new Set([
    PROC_STATUS.COMMIT_READY,
    PROC_STATUS.REVEAL_READY,
    PROC_STATUS.FINALIST_ACCEPT_READY,
    PROC_STATUS.TRIAL_READY,
    PROC_STATUS.COMPLETION_READY,
  ]);

  const handoffs = active.filter(s => HANDOFF_STATUSES.has(s.status));

  console.log("\n══ Prime Orchestrator Report ═════════════════════════════");
  console.log(`  Active: ${active.length}  |  Awaiting operator signature: ${handoffs.length}`);

  if (handoffs.length > 0) {
    console.log("\n  ── OPERATOR ACTION REQUIRED ──────────────────────────");
    for (const s of handoffs) {
      const txKey = {
        [PROC_STATUS.COMMIT_READY]:          "commitApplication",
        [PROC_STATUS.REVEAL_READY]:          "revealApplication",
        [PROC_STATUS.FINALIST_ACCEPT_READY]: "acceptFinalist",
        [PROC_STATUS.TRIAL_READY]:           "submitTrial",
        [PROC_STATUS.COMPLETION_READY]:      "requestJobCompletion",
      }[s.status];
      const txPath = s.txHandoffs?.[txKey] ?? "(path not recorded)";
      console.log(`  #${s.procurementId} ${s.status}`);
      console.log(`    → SIGN: ${txPath}`);
    }
  }

  const inProgress = active.filter(s => !HANDOFF_STATUSES.has(s.status));
  if (inProgress.length > 0) {
    console.log("\n  ── IN PROGRESS ───────────────────────────────────────");
    for (const s of inProgress) {
      const err = s.lastError ? ` | err: ${s.lastError}` : "";
      console.log(`  #${s.procurementId} ${s.status}${err}`);
    }
  }
  console.log("══════════════════════════════════════════════════════════\n");
}

// ── Main orchestration loop ───────────────────────────────────────────────────

async function runOrchestratorCycle() {
  const active = await listActiveProcurements();
  for (const s of active) {
    await orchestrateProcurement(s.procurementId).catch(err =>
      logError(`cycle #${s.procurementId}`, err)
    );
  }
  await printOrchestratorReport();
}

export async function orchestrateOnceForProcurement(procurementId) {
  const stateBefore = await getProcState(procurementId);
  await orchestrateProcurement(procurementId);
  const stateAfter = await getProcState(procurementId);
  const handoffSet = new Set([
    PROC_STATUS.COMMIT_READY,
    PROC_STATUS.REVEAL_READY,
    PROC_STATUS.FINALIST_ACCEPT_READY,
    PROC_STATUS.TRIAL_READY,
    PROC_STATUS.COMPLETION_READY,
  ]);
  return {
    before: stateBefore?.status ?? null,
    after: stateAfter?.status ?? null,
    handoffRequired: handoffSet.has(stateAfter?.status) ? stateAfter.status : null,
  };
}

async function writeReadyPacket(procurementId, action, unsignedTxPath) {
  const root = procRootDir(procurementId);
  const chainSnapshotPath = path.join(root, "chain_snapshot.json");
  const chainSnapshot = await readJson(chainSnapshotPath, {});
  const txPkg = await readJson(unsignedTxPath, {});
  const preconditions = (txPkg.preconditions ?? []).map(p => ({ check: p, passed: true }));
  const packet = {
    procurementId: String(procurementId),
    action,
    decision: "SIGN_NOW",
    generatedAt: new Date().toISOString(),
    unsignedTxPath,
    chainSnapshotHash: sha256Json(chainSnapshot),
    txPackageHash: sha256Json(txPkg),
    preconditions,
  };
  await writeJson(path.join(root, `${action}_ready_packet.json`), packet);
}

function sha256Json(v) {
  return createHash("sha256").update(JSON.stringify(v ?? {}), "utf8").digest("hex");
}

// ── Entry point ───────────────────────────────────────────────────────────────
//
// Usage:
//   node prime/prime-orchestrator.js
//
// Starts both the monitor (read layer) and the orchestrator (action layer).
// They share the same process; the monitor writes snapshots and next_action.json,
// then the orchestrator reads them and acts.

export async function startPrimeOrchestrator() {
  log("Starting Prime orchestrator");
  log(`Agent: ${AGENT_ADDRESS || "(not set)"} / ${AGENT_SUBDOMAIN || "(no subdomain)"}`);

  if (!AGENT_ADDRESS) {
    log("WARNING: AGENT_ADDRESS not set — fit evaluation and application will fail");
  }
  if (!process.env.PINATA_JWT) {
    log("WARNING: PINATA_JWT not set — IPFS publish will fail");
  }

  // Crash recovery.
  await recoverAll();

  // Start monitor (runs setInterval internally).
  await startPrimeMonitor({ agentAddress: AGENT_ADDRESS });

  // Orchestration loop.
  log(`Orchestrator polling every ${POLL_INTERVAL_MS}ms`);
  while (true) {
    try {
      await runOrchestratorCycle();
    } catch (err) {
      logError("orchestrator cycle", err);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

if (process.argv[1]?.endsWith("prime-orchestrator.js")) {
  startPrimeOrchestrator().catch(err => {
    console.error("[prime-orchestrator] Fatal:", err);
    process.exit(1);
  });
}
