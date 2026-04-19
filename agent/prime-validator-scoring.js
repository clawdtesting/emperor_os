// agent/prime-validator-scoring.js
// Canonical validator scoring runtime for Prime monitor/orchestrator/manual flows.
// SAFETY CONTRACT: unsigned-only handoff generation.

import { createHash } from "crypto";
import path from "path";
import {
  readJson,
  writeJson,
  procRootDir,
  procSubdir,
  ensureProcSubdir,
  getProcState,
  setProcState,
  transitionProcStatus,
} from "./prime-state.js";
import {
  discoverValidatorAssignment,
  verifyScoreRevealAgainstCommit,
} from "./prime-validator-engine.js";
import { adjudicateScore } from "../validation/scoring-adjudicator.js";
import {
  buildValidatorScoreCommitHandoff,
  buildValidatorScoreRevealHandoff,
  validateValidatorScoreHandoff,
} from "../validation/score-tx-handoff.js";
import {
  assertValidatorScoreCommitGate,
  assertValidatorScoreRevealGate,
} from "./prime-review-gates.js";
import { PROC_STATUS, CHAIN_PHASE, deriveChainPhase } from "./prime-phase-model.js";
import { writeReconciliationSnapshot } from "./prime-reconciliation.js";

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deterministicSalt(procurementId, score, input) {
  const h = createHash("sha256")
    .update(`${procurementId}:${score}:${stableStringify(input)}`, "utf8")
    .digest("hex");
  return `0x${h}`;
}

async function gatherEvidence(procurementId) {
  const procRoot = procRootDir(procurementId);
  const chainSnapshot = await readJson(path.join(procRoot, "chain_snapshot.json"), null);
  const trialManifest = await readJson(path.join(procSubdir(procurementId, "trial"), "trial_artifact_manifest.json"), null);
  const trialContent = await readTrialContent(procurementId);

  const procurement = chainSnapshot?.procurement ?? {};
  const deadlines = {
    trial: Number(procurement.trialDeadline ?? 0),
    scoreCommit: Number(procurement.scoreCommitDeadline ?? 0),
    scoreReveal: Number(procurement.scoreRevealDeadline ?? 0),
  };

  const evidence = {
    schema: "emperor-os/validator-evidence/v1",
    procurementId: String(procurementId),
    procurement: {
      procStruct: procurement,
      deadlines,
      chainPhase: chainSnapshot?.chainPhase ?? null,
      isScorePhase: ["SCORE_COMMIT", "SCORE_REVEAL"].includes(chainSnapshot?.chainPhase),
    },
    trial: {
      trialManifest,
      trialSubmissions: trialContent
        ? [{ content: trialContent, contentLength: trialContent.length, cid: trialManifest?.trialUri ?? null, trialURI: trialManifest?.trialUri ?? null }]
        : [],
    },
    gatheredAt: new Date().toISOString(),
  };

  return { evidence, trialContent, procStruct: procurement };
}

async function readTrialContent(procurementId) {
  const trialDir = procSubdir(procurementId, "trial");
  const candidates = ["trial_deliverable.md", "trial_content.md", "trial.md"];
  for (const name of candidates) {
    try {
      const { promises: fs } = await import("fs");
      return await fs.readFile(path.join(trialDir, name), "utf8");
    } catch {}
  }
  const manifest = await readJson(path.join(trialDir, "trial_artifact_manifest.json"), null);
  return manifest?.content ?? null;
}

function scoringWindowStatus(procStruct, targetPhase) {
  const phase = deriveChainPhase(procStruct ?? {}, Math.floor(Date.now() / 1000));
  if (phase === targetPhase) return { allowed: true, phase };
  if (targetPhase === CHAIN_PHASE.SCORE_COMMIT && (phase === CHAIN_PHASE.SCORE_REVEAL || phase === CHAIN_PHASE.CLOSED)) {
    return { allowed: false, phase, missed: true };
  }
  if (targetPhase === CHAIN_PHASE.SCORE_REVEAL && phase === CHAIN_PHASE.CLOSED) {
    return { allowed: false, phase, missed: true };
  }
  return { allowed: false, phase, missed: false };
}

async function failClosedWindow({ procurementId, reason, phase }) {
  const state = await getProcState(procurementId);
  if (state?.status !== PROC_STATUS.MISSED_WINDOW) {
    await transitionProcStatus(procurementId, PROC_STATUS.MISSED_WINDOW, {
      missedWindowAt: new Date().toISOString(),
      missedWindowReason: reason,
      scoringWindowPhase: phase,
      recoveryNote: "No signable scoring package produced; window no longer valid.",
    });
  }
}

export async function runValidatorScoreCommit({ procurementId, validatorAddress, assignmentOverride = null, procStructOverride = null }) {
  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  const assignment = assignmentOverride ?? await discoverValidatorAssignment(procurementId, validatorAddress);
  await setProcState(procurementId, { validatorAssignment: assignment, validatorRole: assignment.assigned === true });
  if (!assignment.assigned) return null;

  const { evidence, trialContent, procStruct } = await gatherEvidence(procurementId);
  const effectiveProcStruct = procStructOverride ?? procStruct;
  const window = scoringWindowStatus(effectiveProcStruct, CHAIN_PHASE.SCORE_COMMIT);
  if (!window.allowed) {
    const reason = `score commit blocked: current phase ${window.phase}`;
    if (window.missed) await failClosedWindow({ procurementId, reason, phase: window.phase });
    await setProcState(procurementId, { validatorScoringBlockedReason: reason });
    return null;
  }

  await writeJson(path.join(scoringDir, "evidence_bundle.json"), evidence);
  const adjudication = adjudicateScore(evidence, trialContent);
  await writeJson(path.join(scoringDir, "adjudication_result.json"), adjudication);

  const score = Math.round(adjudication.score);
  const salt = deterministicSalt(procurementId, score, {
    procurementId: String(procurementId),
    validatorAddress: String(validatorAddress).toLowerCase(),
    evidence,
  });

  const handoff = await buildValidatorScoreCommitHandoff({ procurementId, score, salt, adjudication });
  await assertValidatorScoreCommitGate({ procurementId, procStruct: effectiveProcStruct });

  const completeness = await validateValidatorScoreHandoff({ procurementId, mode: "commit" });
  const snapshot = await writeReconciliationSnapshot({
    procurementId,
    nextAction: { action: "NONE", summary: "Validator score commit tx ready for operator signature." },
  });
  if (!completeness.complete || snapshot.readyHandoffComplete !== true) {
    await setProcState(procurementId, {
      validatorScoringBlockedReason: `incomplete score commit bundle: ${completeness.missingRequiredArtifacts.join(",")}`,
    });
    return null;
  }

  await transitionProcStatus(procurementId, PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY, {
    validatorRole: true,
    validatorScore: score,
    validatorScoreCommitment: handoff.payload.scoreCommitment,
    scoringDir,
  });
  return handoff;
}

export async function runValidatorScoreReveal({ procurementId, validatorAddress, assignmentOverride = null, procStructOverride = null }) {
  const scoringDir = procSubdir(procurementId, "scoring");
  const assignment = assignmentOverride ?? await discoverValidatorAssignment(procurementId, validatorAddress);
  await setProcState(procurementId, { validatorAssignment: assignment, validatorRole: assignment.assigned === true });
  if (!assignment.assigned) return null;

  const commitPayload = await readJson(path.join(scoringDir, "score_commit_payload.json"), null);
  if (!commitPayload) throw new Error(`No score_commit_payload.json found for procurement #${procurementId}`);

  const { score, salt, scoreCommitment } = commitPayload;
  const continuity = verifyScoreRevealAgainstCommit({ score, salt, expectedCommitment: scoreCommitment });
  if (!continuity.verified) throw new Error(`Commitment continuity check FAILED for procurement #${procurementId}`);

  const chainSnapshot = await readJson(path.join(procRootDir(procurementId), "chain_snapshot.json"), null);
  const procStruct = procStructOverride ?? chainSnapshot?.procurement ?? null;
  const window = scoringWindowStatus(procStruct, CHAIN_PHASE.SCORE_REVEAL);
  if (!window.allowed) {
    const reason = `score reveal blocked: current phase ${window.phase}`;
    if (window.missed) await failClosedWindow({ procurementId, reason, phase: window.phase });
    await setProcState(procurementId, { validatorScoringBlockedReason: reason });
    return null;
  }

  const adjudication = await readJson(path.join(scoringDir, "adjudication_result.json"), null);
  const handoff = await buildValidatorScoreRevealHandoff({ procurementId, score, salt, adjudication });
  await assertValidatorScoreRevealGate({ procurementId, procStruct });

  const completeness = await validateValidatorScoreHandoff({ procurementId, mode: "reveal", continuity });
  const snapshot = await writeReconciliationSnapshot({
    procurementId,
    nextAction: { action: "NONE", summary: "Validator score reveal tx ready for operator signature." },
  });
  if (!completeness.complete || snapshot.readyHandoffComplete !== true) {
    await setProcState(procurementId, {
      validatorScoringBlockedReason: `incomplete score reveal bundle: ${completeness.missingRequiredArtifacts.join(",")}`,
    });
    return null;
  }

  await transitionProcStatus(procurementId, PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY, {
    validatorRevealPrepared: true,
    validatorRevealContinuityCheck: continuity,
  });
  return handoff;
}
