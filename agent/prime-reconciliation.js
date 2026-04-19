// prime-reconciliation.js
// Deterministic reconciliation snapshot for Prime operator surfaces.

import { promises as fs } from "fs";
import path from "path";
import { procRootDir, getProcState, writeProcCheckpoint } from "./prime-state.js";
import { PROC_STATUS } from "./prime-phase-model.js";
import { SCORE_COMMIT_ARTIFACTS, SCORE_REVEAL_ARTIFACTS } from "../validation/score-tx-handoff.js";

const REQUIRED_BY_STATUS = {
  [PROC_STATUS.INSPECTED]: [
    "inspection/procurement_snapshot.json",
    "inspection/linked_job_snapshot.json",
    "inspection/deadlines_and_windows.json",
    "inspection/phase_snapshot.json",
  ],
  [PROC_STATUS.APPLICATION_DRAFTED]: [
    "application/application_brief.md",
    "application/application_payload.json",
    "application/commitment_material.json",
    "application/review_manifest.json",
  ],
  [PROC_STATUS.COMMIT_READY]: [
    "application/application_brief.md",
    "application/application_payload.json",
    "application/commitment_material.json",
    "application/review_manifest.json",
    "application/unsigned_commit_tx.json",
  ],
  [PROC_STATUS.REVEAL_READY]: [
    "reveal/reveal_payload.json",
    "reveal/commitment_verification.json",
    "reveal/review_manifest.json",
    "reveal/unsigned_reveal_tx.json",
  ],
  [PROC_STATUS.FINALIST_ACCEPT_READY]: [
    "finalist/finalist_acceptance_packet.json",
    "finalist/stake_requirements.json",
    "finalist/stake_preflight.json",
    "finalist/trial_execution_plan.json",
    "finalist/review_manifest.json",
    "finalist/unsigned_accept_finalist_tx.json",
  ],
  [PROC_STATUS.TRIAL_READY]: [
    "trial/trial_artifact_manifest.json",
    "trial/publication_record.json",
    "trial/fetchback_verification.json",
    "trial/review_manifest.json",
    "trial/unsigned_submit_trial_tx.json",
  ],
  [PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY]: SCORE_COMMIT_ARTIFACTS,
  [PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY]: SCORE_REVEAL_ARTIFACTS,
  [PROC_STATUS.COMPLETION_READY]: [
    "selection/selected_agent_status.json",
    "completion/job_execution_plan.json",
    "completion/job_completion.json",
    "completion/completion_manifest.json",
    "completion/publication_record.json",
    "completion/fetchback_verification.json",
    "completion/review_manifest.json",
    "completion/unsigned_request_completion_tx.json",
  ],
};

const READY_STATUSES = new Set([
  PROC_STATUS.COMMIT_READY,
  PROC_STATUS.REVEAL_READY,
  PROC_STATUS.FINALIST_ACCEPT_READY,
  PROC_STATUS.TRIAL_READY,
  PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY,
  PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY,
  PROC_STATUS.COMPLETION_READY,
]);

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

export async function writeReconciliationSnapshot({ procurementId, nextAction = null } = {}) {
  const id = String(procurementId);
  const root = procRootDir(id);
  const state = await getProcState(id);
  const status = state?.status ?? null;
  const required = REQUIRED_BY_STATUS[status] ?? [];

  const requiredChecks = [];
  for (const rel of required) {
    requiredChecks.push({ path: rel, present: await exists(path.join(root, rel)) });
  }

  const missingRequired = requiredChecks.filter((c) => !c.present).map((c) => c.path);
  const readyHandoffComplete = READY_STATUSES.has(status) ? missingRequired.length === 0 : null;

  const snapshot = {
    schema: "emperor-os/prime-reconciliation/v1",
    procurementId: id,
    generatedAt: new Date().toISOString(),
    stateStatus: status,
    nextAction: nextAction?.action ?? null,
    nextActionSummary: nextAction?.summary ?? null,
    requiredArtifacts: requiredChecks,
    missingRequiredArtifacts: missingRequired,
    readyHandoffComplete,
    recommendation: missingRequired.length === 0 ? "PARITY_OK" : "PARITY_BLOCKED_MISSING_ARTIFACTS",
  };

  await writeProcCheckpoint(id, "reconciliation_snapshot.json", snapshot);
  return snapshot;
}
