// prime-review-gates.js
// Hard-stop precondition enforcement before every Prime action.
//
// Each gate checks that all required artifacts exist and are coherent
// before allowing an unsigned tx to be built or an action to proceed.
//
// Gates FAIL CLOSED: if a required artifact or condition is missing,
// the gate throws a descriptive error. No silent pass-throughs.
//
// SAFETY CONTRACT: Read-only checks. No signing. No broadcasting.

import { promises as fs } from "fs";
import path from "path";
import { CONFIG } from "./config.js";
import { readJson, procSubdir, procRootDir } from "./prime-state.js";
import { deriveChainPhase, CHAIN_PHASE } from "./prime-phase-model.js";

// ── Gate result type ──────────────────────────────────────────────────────────

class GateError extends Error {
  constructor(gate, failures) {
    const lines = failures.map(f => `  - ${f}`).join("\n");
    super(`[${gate}] Gate failed — ${failures.length} condition(s) not met:\n${lines}`);
    this.gate     = gate;
    this.failures = failures;
  }
}

// ── File existence helpers ────────────────────────────────────────────────────

async function fileExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function requireFile(failures, filePath, label) {
  if (!(await fileExists(filePath))) {
    failures.push(`Missing required artifact: ${label} (${filePath})`);
  }
}

async function requireJsonField(failures, filePath, fieldPath, label) {
  try {
    const data = await readJson(filePath);
    if (!data) { failures.push(`${label}: file empty or unreadable`); return; }
    const parts = fieldPath.split(".");
    let cur = data;
    for (const p of parts) {
      cur = cur?.[p];
    }
    if (cur == null || cur === "" || cur === false) {
      failures.push(`${label}: required field '${fieldPath}' is missing or falsy`);
    }
  } catch {
    failures.push(`${label}: cannot read or parse file at ${filePath}`);
  }
}

// ── COMMIT GATE ───────────────────────────────────────────────────────────────

/**
 * Gate before building/signing the commitApplication tx.
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {object} opts.procStruct   - chain procurement data
 * @param {number} [opts.nowSecs]
 * @throws {GateError}
 */
export async function assertCommitGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id  = String(procurementId);

  // Chain phase check
  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.COMMIT_OPEN) {
    failures.push(`Chain phase is ${chainPhase}, not COMMIT_OPEN. Commit window is not open.`);
  }

  // Required artifacts
  const appDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "application");
  await requireFile(failures, path.join(appDir, "application_brief.md"),        "application_brief.md");
  await requireFile(failures, path.join(appDir, "application_payload.json"),     "application_payload.json");
  await requireFile(failures, path.join(appDir, "commitment_material.json"),     "commitment_material.json");

  // Required fields
  await requireJsonField(failures, path.join(appDir, "application_payload.json"),  "applicationURI", "application_payload.applicationURI");
  await requireJsonField(failures, path.join(appDir, "commitment_material.json"),   "salt",           "commitment_material.salt");
  await requireJsonField(failures, path.join(appDir, "commitment_material.json"),   "commitmentHash", "commitment_material.commitmentHash");

  // Inspection bundle check
  const inspDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "inspection");
  await requireFile(failures, path.join(inspDir, "fit_evaluation.json"),           "inspection/fit_evaluation.json");
  await requireJsonFieldValue(failures, path.join(inspDir, "fit_evaluation.json"),
    "decision", "PASS", "fit_evaluation.decision");

  if (failures.length > 0) throw new GateError("COMMIT_GATE", failures);
}

// ── REVEAL GATE ───────────────────────────────────────────────────────────────

/**
 * Gate before building/signing the revealApplication tx.
 * @param {object} opts
 * @param {string|number} opts.procurementId
 * @param {object} opts.procStruct
 * @param {number} [opts.nowSecs]
 * @throws {GateError}
 */
export async function assertRevealGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id  = String(procurementId);

  // Chain phase
  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.REVEAL_OPEN) {
    failures.push(`Chain phase is ${chainPhase}, not REVEAL_OPEN. Reveal window is not open.`);
  }

  // Required artifacts
  const appDir    = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "application");
  const revealDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "reveal");

  await requireFile(failures, path.join(appDir, "commitment_material.json"), "application/commitment_material.json");
  await requireJsonField(failures, path.join(appDir, "commitment_material.json"), "salt",           "commitment_material.salt");
  await requireJsonField(failures, path.join(appDir, "commitment_material.json"), "applicationURI", "commitment_material.applicationURI");
  await requireJsonField(failures, path.join(appDir, "commitment_material.json"), "commitmentHash", "commitment_material.commitmentHash");

  await requireFile(failures, path.join(revealDir, "commitment_verification.json"), "reveal/commitment_verification.json");
  await requireJsonFieldValue(failures, path.join(revealDir, "commitment_verification.json"),
    "verificationPassed", true, "commitment_verification.verificationPassed");

  await requireFile(failures, path.join(revealDir, "reveal_payload.json"), "reveal/reveal_payload.json");

  if (failures.length > 0) throw new GateError("REVEAL_GATE", failures);
}

// ── FINALIST ACCEPTANCE GATE ──────────────────────────────────────────────────

/**
 * Gate before building/signing the acceptFinalist tx.
 */
export async function assertFinalistAcceptGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id  = String(procurementId);

  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.FINALIST_ACCEPT) {
    failures.push(`Chain phase is ${chainPhase}, not FINALIST_ACCEPT.`);
  }

  const finalistDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "finalist");
  await requireFile(failures, path.join(finalistDir, "finalist_acceptance_packet.json"), "finalist/finalist_acceptance_packet.json");
  await requireFile(failures, path.join(finalistDir, "stake_requirements.json"),          "finalist/stake_requirements.json");
  await requireFile(failures, path.join(finalistDir, "stake_preflight.json"),             "finalist/stake_preflight.json");
  await requireFile(failures, path.join(finalistDir, "trial_execution_plan.json"),        "finalist/trial_execution_plan.json");
  await requireFile(failures, path.join(finalistDir, "review_manifest.json"),             "finalist/review_manifest.json");
  await requireJsonFieldValue(failures, path.join(finalistDir, "stake_preflight.json"), "hasSufficientBalance", true, "stake_preflight.hasSufficientBalance");
  await requireJsonFieldValue(failures, path.join(finalistDir, "stake_preflight.json"), "allowanceSufficient", true, "stake_preflight.allowanceSufficient");

  // Verify shortlisted state
  const stateFile = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "state.json");
  await requireFile(failures, stateFile, "state.json");
  await requireJsonFieldValue(failures, stateFile, "shortlisted", true, "state.shortlisted");

  if (failures.length > 0) throw new GateError("FINALIST_ACCEPT_GATE", failures);
}

// ── TRIAL SUBMISSION GATE ─────────────────────────────────────────────────────

/**
 * Gate before building/signing the submitTrial tx.
 */
export async function assertTrialSubmitGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id  = String(procurementId);

  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.TRIAL_OPEN) {
    failures.push(`Chain phase is ${chainPhase}, not TRIAL_OPEN. Trial window is not open.`);
  }

  const trialDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "trial");
  await requireFile(failures, path.join(trialDir, "trial_artifact_manifest.json"),  "trial/trial_artifact_manifest.json");
  await requireFile(failures, path.join(trialDir, "publication_record.json"),         "trial/publication_record.json");
  await requireFile(failures, path.join(trialDir, "fetchback_verification.json"),     "trial/fetchback_verification.json");
  await requireFile(failures, path.join(trialDir, "review_manifest.json"),            "trial/review_manifest.json");

  await requireJsonField(failures, path.join(trialDir, "trial_artifact_manifest.json"),  "trialURI",  "trial_artifact_manifest.trialURI");
  await requireJsonFieldValue(failures, path.join(trialDir, "fetchback_verification.json"),   "verified", true,  "fetchback_verification.verified");

  // Confirm fetcback passed
  try {
    const fv = await readJson(path.join(trialDir, "fetchback_verification.json"));
    if (fv && fv.verified !== true) {
      failures.push("fetchback_verification.verified is not true — publication not confirmed.");
    }
  } catch { /* already caught above */ }

  if (failures.length > 0) throw new GateError("TRIAL_SUBMIT_GATE", failures);
}

// ── COMPLETION GATE ───────────────────────────────────────────────────────────

/**
 * Gate before building/signing the requestJobCompletion tx (Prime-linked).
 */
export async function assertCompletionGate({ procurementId }) {
  const failures = [];
  const id = String(procurementId);

  const stateFile    = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "state.json");
  const completionDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "completion");
  const selectionDir  = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "selection");

  await requireFile(failures, stateFile, "state.json");
  await requireJsonFieldValue(failures, stateFile, "selected", true,   "state.selected");
  await requireJsonField(failures, stateFile, "linkedJobId", "state.linkedJobId");

  await requireFile(failures, path.join(selectionDir, "selected_agent_status.json"), "selection/selected_agent_status.json");
  await requireJsonFieldValue(failures, path.join(selectionDir, "selected_agent_status.json"), "selected", true, "selected_agent_status.selected");

  await requireFile(failures, path.join(completionDir, "job_completion.json"),           "completion/job_completion.json");
  await requireFile(failures, path.join(completionDir, "publication_record.json"),        "completion/publication_record.json");
  await requireFile(failures, path.join(completionDir, "fetchback_verification.json"),    "completion/fetchback_verification.json");

  await requireJsonField(failures, path.join(completionDir, "job_completion.json"),        "completionURI", "job_completion.completionURI");
  await requireJsonFieldValue(failures, path.join(completionDir, "fetchback_verification.json"), "verified", true,     "fetchback_verification.verified");

  try {
    const fv = await readJson(path.join(completionDir, "fetchback_verification.json"));
    if (fv && fv.verified !== true) {
      failures.push("completion fetchback_verification.verified is not true.");
    }
  } catch {}

  if (failures.length > 0) throw new GateError("COMPLETION_GATE", failures);
}

// ── VALIDATOR SCORE COMMIT GATE ───────────────────────────────────────────────

/**
 * Gate before building/signing the validator scoreCommit tx.
 */
export async function assertValidatorScoreCommitGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id = String(procurementId);

  // Chain phase check
  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.SCORE_COMMIT) {
    failures.push(`Chain phase is ${chainPhase}, not SCORE_COMMIT. Score commit window is not open.`);
  }

  // Required artifacts
  const scoringDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "scoring");
  await requireFile(failures, path.join(scoringDir, "validator_assignment.json"), "scoring/validator_assignment.json");
  await requireFile(failures, path.join(scoringDir, "evidence_bundle.json"), "scoring/evidence_bundle.json");
  await requireFile(failures, path.join(scoringDir, "adjudication_result.json"), "scoring/adjudication_result.json");
  await requireFile(failures, path.join(scoringDir, "score_commit_payload.json"), "scoring/score_commit_payload.json");

  // Required fields
  await requireJsonField(failures, path.join(scoringDir, "validator_assignment.json"), "assigned", "validator_assignment.assigned");
  await requireJsonFieldValue(failures, path.join(scoringDir, "validator_assignment.json"), "assigned", true, "validator_assignment.assigned");
  await requireJsonField(failures, path.join(scoringDir, "score_commit_payload.json"), "scoreCommitment", "score_commit_payload.scoreCommitment");

  // State check
  const stateFile = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "state.json");
  await requireFile(failures, stateFile, "state.json");
  await requireJsonFieldValue(failures, stateFile, "validatorRole", true, "state.validatorRole");

  if (failures.length > 0) throw new GateError("VALIDATOR_SCORE_COMMIT_GATE", failures);
}

// ── VALIDATOR SCORE REVEAL GATE ───────────────────────────────────────────────

/**
 * Gate before building/signing the validator scoreReveal tx.
 */
export async function assertValidatorScoreRevealGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id = String(procurementId);

  // Chain phase check
  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.SCORE_REVEAL) {
    failures.push(`Chain phase is ${chainPhase}, not SCORE_REVEAL. Score reveal window is not open.`);
  }

  // Required artifacts
  const scoringDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "scoring");
  await requireFile(failures, path.join(scoringDir, "score_commit_payload.json"), "scoring/score_commit_payload.json");
  await requireFile(failures, path.join(scoringDir, "score_reveal_payload.json"), "scoring/score_reveal_payload.json");

  // Required fields
  await requireJsonField(failures, path.join(scoringDir, "score_commit_payload.json"), "scoreCommitment", "score_commit_payload.scoreCommitment");
  await requireJsonField(failures, path.join(scoringDir, "score_reveal_payload.json"), "salt", "score_reveal_payload.salt");
  await requireJsonField(failures, path.join(scoringDir, "score_reveal_payload.json"), "score", "score_reveal_payload.score");

  // Verify commitment continuity
  try {
    const commitPayload = await readJson(path.join(scoringDir, "score_commit_payload.json"));
    const revealPayload = await readJson(path.join(scoringDir, "score_reveal_payload.json"));
    if (commitPayload && revealPayload) {
      const { verifyScoreReveal } = await import("../validation/scoring-adjudicator.js");
      const check = verifyScoreReveal({
        score: revealPayload.score,
        salt: revealPayload.salt,
        expectedCommitment: commitPayload.scoreCommitment,
      });
      if (!check.verified) {
        failures.push("Commitment continuity check failed: reveal does not match prior commit.");
      }
    }
  } catch (err) {
    failures.push(`Cannot verify commitment continuity: ${err.message}`);
  }

  // State check
  const stateFile = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "state.json");
  await requireFile(failures, stateFile, "state.json");
  await requireJsonFieldValue(failures, stateFile, "validatorRole", true, "state.validatorRole");

  if (failures.length > 0) throw new GateError("VALIDATOR_SCORE_REVEAL_GATE", failures);
}

// ── VALIDATOR SCORE COMMIT GATE ───────────────────────────────────────────────

/**
 * Gate before building/signing the validator scoreCommit tx.
 */
export async function assertValidatorScoreCommitGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id = String(procurementId);

  // Chain phase check
  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.SCORE_COMMIT) {
    failures.push(`Chain phase is ${chainPhase}, not SCORE_COMMIT. Score commit window is not open.`);
  }

  // Required artifacts
  const scoringDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "scoring");
  await requireFile(failures, path.join(scoringDir, "validator_assignment.json"), "scoring/validator_assignment.json");
  await requireFile(failures, path.join(scoringDir, "evidence_bundle.json"), "scoring/evidence_bundle.json");
  await requireFile(failures, path.join(scoringDir, "adjudication_result.json"), "scoring/adjudication_result.json");
  await requireFile(failures, path.join(scoringDir, "score_commit_payload.json"), "scoring/score_commit_payload.json");

  // Required fields
  await requireJsonField(failures, path.join(scoringDir, "validator_assignment.json"), "assigned", "validator_assignment.assigned");
  await requireJsonFieldValue(failures, path.join(scoringDir, "validator_assignment.json"), "assigned", true, "validator_assignment.assigned");
  await requireJsonField(failures, path.join(scoringDir, "score_commit_payload.json"), "scoreCommitment", "score_commit_payload.scoreCommitment");

  // State check
  const stateFile = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "state.json");
  await requireFile(failures, stateFile, "state.json");
  await requireJsonFieldValue(failures, stateFile, "validatorRole", true, "state.validatorRole");

  if (failures.length > 0) throw new GateError("VALIDATOR_SCORE_COMMIT_GATE", failures);
}

// ── VALIDATOR SCORE REVEAL GATE ───────────────────────────────────────────────

/**
 * Gate before building/signing the validator scoreReveal tx.
 */
export async function assertValidatorScoreRevealGate({ procurementId, procStruct, nowSecs }) {
  const failures = [];
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const id = String(procurementId);

  // Chain phase check
  const chainPhase = deriveChainPhase(procStruct, now);
  if (chainPhase !== CHAIN_PHASE.SCORE_REVEAL) {
    failures.push(`Chain phase is ${chainPhase}, not SCORE_REVEAL. Score reveal window is not open.`);
  }

  // Required artifacts
  const scoringDir = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "scoring");
  await requireFile(failures, path.join(scoringDir, "score_commit_payload.json"), "scoring/score_commit_payload.json");
  await requireFile(failures, path.join(scoringDir, "score_reveal_payload.json"), "scoring/score_reveal_payload.json");

  // Required fields
  await requireJsonField(failures, path.join(scoringDir, "score_commit_payload.json"), "scoreCommitment", "score_commit_payload.scoreCommitment");
  await requireJsonField(failures, path.join(scoringDir, "score_reveal_payload.json"), "salt", "score_reveal_payload.salt");
  await requireJsonField(failures, path.join(scoringDir, "score_reveal_payload.json"), "score", "score_reveal_payload.score");

  // Verify commitment continuity
  try {
    const commitPayload = await readJson(path.join(scoringDir, "score_commit_payload.json"));
    const revealPayload = await readJson(path.join(scoringDir, "score_reveal_payload.json"));
    if (commitPayload && revealPayload) {
      const { verifyScoreReveal } = await import("../validation/scoring-adjudicator.js");
      const check = verifyScoreReveal({
        score: revealPayload.score,
        salt: revealPayload.salt,
        expectedCommitment: commitPayload.scoreCommitment,
      });
      if (!check.verified) {
        failures.push("Commitment continuity check failed: reveal does not match prior commit.");
      }
    }
  } catch (err) {
    failures.push(`Cannot verify commitment continuity: ${err.message}`);
  }

  // State check
  const stateFile = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${id}`, "state.json");
  await requireFile(failures, stateFile, "state.json");
  await requireJsonFieldValue(failures, stateFile, "validatorRole", true, "state.validatorRole");

  if (failures.length > 0) throw new GateError("VALIDATOR_SCORE_REVEAL_GATE", failures);
}

// ── Generic gate runner (try/catch wrapper) ───────────────────────────────────

/**
 * Runs a gate function and returns { passed: true } or { passed: false, error, failures }.
 * Does not throw — useful for status checks without hard stops.
 */
export async function checkGate(gateFn, opts) {
  try {
    await gateFn(opts);
    return { passed: true, failures: [] };
  } catch (err) {
    if (err instanceof GateError) {
      return { passed: false, gate: err.gate, failures: err.failures, error: err.message };
    }
    return { passed: false, gate: "UNKNOWN", failures: [err.message], error: err.message };
  }
}
