// validation/lifecycle-branch.js
// Validator role lifecycle branch for the AGIJobManager pipeline.
//
// This module adds validator role awareness to the v1 pipeline orchestrator.
// It provides:
//   - Validator role detection (am I a validator for this procurement?)
//   - Lifecycle state machine for validator-specific phases
//   - Integration points with the existing Prime pipeline
//
// Validator lifecycle states:
//   VALIDATOR_IDLE          → not assigned as validator
//   VALIDATOR_DISCOVERED    → assignment detected on chain
//   VALIDATOR_EVALUATING    → fetching evidence, computing score
//   VALIDATOR_COMMIT_READY  → score commit tx ready for operator
//   VALIDATOR_COMMIT_SUBMITTED → commit tx broadcast, awaiting reveal
//   VALIDATOR_REVEAL_READY  → score reveal tx ready for operator
//   VALIDATOR_REVEAL_SUBMITTED → reveal tx broadcast, awaiting settlement
//   VALIDATOR_SETTLED       → scoring complete, settlement reconciled
//
// SAFETY CONTRACT: No signing. No broadcasting. State machine only.

import { PROC_STATUS, isValidTransition, assertValidTransition } from "../agent/prime-phase-model.js";
import { getProcState, setProcState, transitionProcStatus, ensureProcSubdir, writeJson, readJson } from "../agent/prime-state.js";
import { fetchValidatorAssignment } from "../agent/prime-client.js";
import { VALIDATOR_CONFIG } from "./config.js";

export const VALIDATOR_LIFECYCLE = {
  IDLE: "VALIDATOR_IDLE",
  DISCOVERED: "VALIDATOR_DISCOVERED",
  EVALUATING: "VALIDATOR_EVALUATING",
  COMMIT_READY: "VALIDATOR_COMMIT_READY",
  COMMIT_SUBMITTED: "VALIDATOR_COMMIT_SUBMITTED",
  REVEAL_READY: "VALIDATOR_REVEAL_READY",
  REVEAL_SUBMITTED: "VALIDATOR_REVEAL_SUBMITTED",
  SETTLED: "VALIDATOR_SETTLED",
};

const VALIDATOR_TRANSITIONS = {
  [VALIDATOR_LIFECYCLE.IDLE]: [VALIDATOR_LIFECYCLE.DISCOVERED],
  [VALIDATOR_LIFECYCLE.DISCOVERED]: [VALIDATOR_LIFECYCLE.EVALUATING],
  [VALIDATOR_LIFECYCLE.EVALUATING]: [VALIDATOR_LIFECYCLE.COMMIT_READY],
  [VALIDATOR_LIFECYCLE.COMMIT_READY]: [VALIDATOR_LIFECYCLE.COMMIT_SUBMITTED],
  [VALIDATOR_LIFECYCLE.COMMIT_SUBMITTED]: [VALIDATOR_LIFECYCLE.REVEAL_READY],
  [VALIDATOR_LIFECYCLE.REVEAL_READY]: [VALIDATOR_LIFECYCLE.REVEAL_SUBMITTED],
  [VALIDATOR_LIFECYCLE.REVEAL_SUBMITTED]: [VALIDATOR_LIFECYCLE.SETTLED],
  [VALIDATOR_LIFECYCLE.SETTLED]: [],
};

export function isValidValidatorTransition(from, to) {
  const allowed = VALIDATOR_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function assertValidValidatorTransition(from, to) {
  if (!isValidValidatorTransition(from, to)) {
    const allowed = VALIDATOR_TRANSITIONS[from] ?? [];
    throw new Error(
      `Invalid validator transition: ${from} → ${to}. ` +
      `Allowed: [${allowed.join(", ")}]`
    );
  }
}

export async function discoverValidatorRole(procurementId, validatorAddress) {
  const address = validatorAddress || VALIDATOR_CONFIG.VALIDATOR_ADDRESS;
  if (!address) {
    return { assigned: false, reason: "no_validator_address" };
  }

  const assignment = await fetchValidatorAssignment(procurementId, address);

  const result = {
    procurementId: String(procurementId),
    validatorAddress: address.toLowerCase(),
    assigned: Boolean(assignment?.assigned),
    assignment,
    checkedAt: new Date().toISOString(),
  };

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  await writeJson(`${scoringDir}/validator_assignment.json`, result);

  if (result.assigned) {
    const state = await getProcState(procurementId);
    if (state) {
      await setProcState(procurementId, {
        validatorRole: true,
        validatorAssignment: result,
        validatorLifecycle: VALIDATOR_LIFECYCLE.DISCOVERED,
      });
    }
  }

  return result;
}

export async function advanceValidatorLifecycle(procurementId, nextStatus) {
  const state = await getProcState(procurementId);
  if (!state) {
    throw new Error(`No state found for procurement ${procurementId}`);
  }

  const current = state.validatorLifecycle || VALIDATOR_LIFECYCLE.IDLE;
  assertValidValidatorTransition(current, nextStatus);

  await setProcState(procurementId, {
    validatorLifecycle: nextStatus,
    validatorLifecycleHistory: [
      ...(state.validatorLifecycleHistory || []),
      { status: nextStatus, at: new Date().toISOString() },
    ],
  });

  return { from: current, to: nextStatus, procurementId: String(procurementId) };
}

export function getValidatorNextAction(lifecycleStatus, chainPhase) {
  const actions = {
    [VALIDATOR_LIFECYCLE.IDLE]: {
      action: "CHECK_ASSIGNMENT",
      summary: "Check if we are assigned as validator for any procurements.",
      blockedReason: null,
    },
    [VALIDATOR_LIFECYCLE.DISCOVERED]: {
      action: "FETCH_EVIDENCE",
      summary: "Fetch trial evidence and procurement data for scoring.",
      blockedReason: null,
    },
    [VALIDATOR_LIFECYCLE.EVALUATING]: {
      action: "COMPUTE_SCORE",
      summary: "Compute score from evidence and prepare commitment.",
      blockedReason: null,
    },
    [VALIDATOR_LIFECYCLE.COMMIT_READY]: {
      action: "NONE",
      summary: "Score commit tx ready for operator signature.",
      blockedReason: "Operator must sign scoring/unsigned_score_commit_tx.json.",
    },
    [VALIDATOR_LIFECYCLE.COMMIT_SUBMITTED]: {
      action: "WAIT_REVEAL_WINDOW",
      summary: "Commit submitted. Waiting for reveal window to open.",
      blockedReason: chainPhase !== "SCORE_REVEAL" ? "Reveal window not yet open." : null,
    },
    [VALIDATOR_LIFECYCLE.REVEAL_READY]: {
      action: "NONE",
      summary: "Score reveal tx ready for operator signature.",
      blockedReason: "Operator must sign scoring/unsigned_score_reveal_tx.json.",
    },
    [VALIDATOR_LIFECYCLE.REVEAL_SUBMITTED]: {
      action: "WAIT_SETTLEMENT",
      summary: "Reveal submitted. Waiting for settlement.",
      blockedReason: null,
    },
    [VALIDATOR_LIFECYCLE.SETTLED]: {
      action: "RECONCILE",
      summary: "Settlement complete. Run reconciliation report.",
      blockedReason: null,
    },
  };

  return actions[lifecycleStatus] || {
    action: "UNKNOWN",
    summary: `Unknown validator lifecycle status: ${lifecycleStatus}`,
    blockedReason: "Invalid lifecycle status.",
  };
}

export function mapValidatorLifecycleToProcStatus(lifecycle) {
  const mapping = {
    [VALIDATOR_LIFECYCLE.IDLE]: null,
    [VALIDATOR_LIFECYCLE.DISCOVERED]: PROC_STATUS.WAITING_SCORE_PHASE,
    [VALIDATOR_LIFECYCLE.EVALUATING]: PROC_STATUS.WAITING_SCORE_PHASE,
    [VALIDATOR_LIFECYCLE.COMMIT_READY]: PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY,
    [VALIDATOR_LIFECYCLE.COMMIT_SUBMITTED]: PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED,
    [VALIDATOR_LIFECYCLE.REVEAL_READY]: PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY,
    [VALIDATOR_LIFECYCLE.REVEAL_SUBMITTED]: PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED,
    [VALIDATOR_LIFECYCLE.SETTLED]: PROC_STATUS.WAITING_SCORE_PHASE,
  };
  return mapping[lifecycle] || null;
}

export function isValidatorHandoffStatus(procStatus) {
  return procStatus === PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY ||
    procStatus === PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY;
}
