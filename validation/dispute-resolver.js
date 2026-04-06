// validation/dispute-resolver.js
// Validator dispute and adjudication module.
//
// Handles:
//   - Dispute detection when validator scores diverge significantly
//   - Evidence collection for disputed scores
//   - Adjudication workflow (proposal → review → resolution)
//   - Dispute state persistence
//
// SAFETY CONTRACT: No signing. No broadcasting. No private keys.
// All dispute actions are prepared as unsigned packages for operator review.

import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { ensureProcSubdir, writeJson, readJson } from "../agent/prime-state.js";
import { VALIDATOR_CONFIG } from "./config.js";

export const DISPUTE_STATUS = {
  PROPOSED: "PROPOSED",
  EVIDENCE_COLLECTING: "EVIDENCE_COLLECTING",
  UNDER_REVIEW: "UNDER_REVIEW",
  RESOLVED: "RESOLVED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
};

const TERMINAL_DISPUTE_STATUSES = new Set([
  DISPUTE_STATUS.RESOLVED,
  DISPUTE_STATUS.REJECTED,
  DISPUTE_STATUS.EXPIRED,
]);

function hashEvidence(evidence) {
  return createHash("sha256")
    .update(JSON.stringify(evidence ?? {}), "utf8")
    .digest("hex");
}

export function detectDisputes(scoreRecords, threshold = VALIDATOR_CONFIG.DISPUTE_SCORE_DELTA) {
  if (!Array.isArray(scoreRecords) || scoreRecords.length < 2) {
    return { disputes: [], detected: false };
  }

  const validScores = scoreRecords.filter(s => s.score !== null && s.score !== undefined);
  const disputes = [];

  for (let i = 0; i < validScores.length; i++) {
    for (let j = i + 1; j < validScores.length; j++) {
      const diff = Math.abs(validScores[i].score - validScores[j].score);
      if (diff > threshold) {
        disputes.push({
          disputeId: generateDisputeId(validScores[i].validator, validScores[j].validator),
          validatorA: validScores[i].validator,
          validatorB: validScores[j].validator,
          scoreA: validScores[i].score,
          scoreB: validScores[j].score,
          delta: diff,
          severity: diff > threshold * 2 ? "CRITICAL" : "HIGH",
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  return { disputes, detected: disputes.length > 0 };
}

function generateDisputeId(validatorA, validatorB) {
  const sorted = [validatorA.toLowerCase(), validatorB.toLowerCase()].sort();
  return `dispute_${sorted[0].slice(0, 8)}_${sorted[1].slice(0, 8)}_${Date.now().toString(36)}`;
}

export async function openDispute({ procurementId, disputeId, validatorA, validatorB, scoreA, scoreB, delta, evidence }) {
  const disputeDir = await ensureProcSubdir(procurementId, "disputes");
  const disputePath = path.join(disputeDir, `${disputeId}.json`);

  const dispute = {
    schema: "emperor-os/validator-dispute/v1",
    disputeId,
    procurementId: String(procurementId),
    status: DISPUTE_STATUS.PROPOSED,
    validatorA: validatorA.toLowerCase(),
    validatorB: validatorB.toLowerCase(),
    scoreA,
    scoreB,
    delta,
    evidence: evidence ? {
      hash: hashEvidence(evidence),
      data: evidence,
    } : null,
    timeline: [
      { event: "PROPOSED", at: new Date().toISOString() },
    ],
    deadline: new Date(Date.now() + VALIDATOR_CONFIG.DISPUTE_EVIDENCE_DEADLINE_SECS * 1000).toISOString(),
    resolution: null,
    generatedAt: new Date().toISOString(),
  };

  await writeJson(disputePath, dispute);
  return dispute;
}

export async function collectDisputeEvidence(procurementId, disputeId, evidence) {
  const disputeDir = await ensureProcSubdir(procurementId, "disputes");
  const disputePath = path.join(disputeDir, `${disputeId}.json`);
  const dispute = await readJson(disputePath, null);

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found for procurement ${procurementId}`);
  }

  if (TERMINAL_DISPUTE_STATUSES.has(dispute.status)) {
    throw new Error(`Dispute ${disputeId} is in terminal status: ${dispute.status}`);
  }

  const evidenceEntry = {
    hash: hashEvidence(evidence),
    data: evidence,
    submittedAt: new Date().toISOString(),
  };

  dispute.evidence = dispute.evidence ? {
    ...dispute.evidence,
    additional: [...(dispute.evidence.additional || []), evidenceEntry],
  } : evidenceEntry;

  dispute.status = DISPUTE_STATUS.EVIDENCE_COLLECTING;
  dispute.timeline.push({
    event: "EVIDENCE_COLLECTING",
    at: new Date().toISOString(),
    evidenceHash: evidenceEntry.hash,
  });

  await writeJson(disputePath, dispute);
  return dispute;
}

export async function resolveDispute(procurementId, disputeId, resolution) {
  const disputeDir = await ensureProcSubdir(procurementId, "disputes");
  const disputePath = path.join(disputeDir, `${disputeId}.json`);
  const dispute = await readJson(disputePath, null);

  if (!dispute) {
    throw new Error(`Dispute ${disputeId} not found for procurement ${procurementId}`);
  }

  dispute.status = DISPUTE_STATUS.RESOLVED;
  dispute.resolution = {
    decision: resolution.decision,
    reason: resolution.reason,
    adjustedScore: resolution.adjustedScore ?? null,
    resolvedBy: resolution.resolvedBy ?? "operator",
    resolvedAt: new Date().toISOString(),
  };
  dispute.timeline.push({
    event: "RESOLVED",
    at: new Date().toISOString(),
    decision: resolution.decision,
  });

  await writeJson(disputePath, dispute);
  return dispute;
}

export async function listDisputes(procurementId) {
  const disputeDir = await ensureProcSubdir(procurementId, "disputes");
  const disputes = [];

  try {
    const files = await fs.readdir(disputeDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const dispute = await readJson(path.join(disputeDir, file), null);
      if (dispute) disputes.push(dispute);
    }
  } catch {
    return [];
  }

  return disputes.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
}

export function buildDisputeReviewPacket(dispute) {
  return {
    schema: "emperor-os/dispute-review-packet/v1",
    disputeId: dispute.disputeId,
    procurementId: dispute.procurementId,
    status: dispute.status,
    validators: [dispute.validatorA, dispute.validatorB],
    scores: { a: dispute.scoreA, b: dispute.scoreB, delta: dispute.delta },
    evidenceCount: dispute.evidence
      ? 1 + (dispute.evidence.additional?.length || 0)
      : 0,
    deadline: dispute.deadline,
    timeline: dispute.timeline,
    reviewChecklist: [
      "Review both validator scores and justification",
      "Examine all submitted evidence",
      "Determine if score delta is justified by deliverable quality",
      "Decide: uphold both scores, adjust one, or invalidate",
      "Document resolution reason",
    ],
    generatedAt: new Date().toISOString(),
  };
}
