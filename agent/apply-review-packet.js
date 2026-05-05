// agent/apply-review-packet.js
// Builds the apply review packet for a job that has been approved for apply.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Builds an apply review packet.
 * @param {Object} jobState - The job state object.
 * @param {string} artifactDir - The absolute path to the job's artifact directory.
 * @returns {Object} The apply review packet.
 */
export function buildApplyReviewPacket(jobState, artifactDir) {
  const now = new Date().toISOString();

  return {
    jobId: jobState.jobId,
    protocol: jobState.contractVersion,
    source: jobState.source,
    title: jobState.title,
    category: jobState.category,
    payout: jobState.payout,
    durationSeconds: jobState.durationSeconds,
    details: jobState.details,
    decision: jobState.decision,
    score: jobState.score,
    scoreReason: jobState.scoreReason,
    reviewedAt: jobState.reviewedAt,
    artifactDir: artifactDir,
    unsignedTxPath: path.join(artifactDir, "unsigned_apply_tx.json"),
    generatedAt: now,
    note: "This is an apply review packet for operator review. No transaction has been signed or broadcast by Emperor OS.",
    operatorApproval: {
      approvedLocally: true,
      approvedAt: now,
      approvalSource: "local_cli",
      note: "This approval only authorizes creation of an unsigned apply package. It does not sign or broadcast."
    },
    checklist: [
      "Review the job details (title, category, payout, duration).",
      "Review the decision and score.",
      "Check the unsigned transaction package fields for correctness.",
      "Re-check on-chain/MCP job status before any external signing decision.",
      "If still valid, export this unsigned transaction package to an external wallet flow.",
      "Signing and broadcasting happen outside Emperor OS."
    ],
    warnings: [
      "Emperor OS did not sign this transaction.",
      "Emperor OS did not broadcast this transaction.",
      "Emperor OS does not manage nonce for this transaction.",
      "Emperor OS does not custody private keys.",
      "The operator must re-check the job status on-chain before signing externally.",
      "This packet is for review only and does not constitute a binding submission."
    ]
  };
}

// Run if invoked directly (for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[apply-review-packet] This module is intended to be imported. Use approve_for_apply.js to generate packets.");
}