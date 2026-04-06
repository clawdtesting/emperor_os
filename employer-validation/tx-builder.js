// employer-validation/tx-builder.js
// Builds unsigned transaction packages for employer-side actions.
//
// Currently supports:
//   - No on-chain employer actions exist in the AGIJobManager ABI yet.
//   - This module prepares the infrastructure for when employer functions
//     (acceptCompletion, dispute, rejectDelivery) are added.
//
// For now, produces review decision packages for operator reference.
//
// SAFETY CONTRACT: No signing. No broadcasting. No private keys.

import { createHash } from "crypto";
import { CONFIG } from "../agent/config.js";
import { EMPLOYER_CONFIG } from "./config.js";
import { promises as fs } from "fs";
import path from "path";

const REVIEW_ROOT = path.join(CONFIG.WORKSPACE_ROOT, "employer-validation", "reviews");

async function ensureReviewDir() {
  await fs.mkdir(REVIEW_ROOT, { recursive: true });
}

function sha256(str) {
  return createHash("sha256").update(str, "utf8").digest("hex");
}

export function buildReviewDecisionPackage({ jobId, review, decision, reason }) {
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    schema: "emperor-os/employer-review-decision/v1",
    jobId: String(jobId),
    contract: CONFIG.CONTRACT,
    chainId: CONFIG.CHAIN_ID,
    decision,
    reason,
    reviewScore: review?.overallScore ?? null,
    recommendation: review?.recommendation ?? null,
    generatedAt,
    expiresAt,
    employerAddress: EMPLOYER_CONFIG.EMPLOYER_ADDRESS,
    reviewChecklist: [
      "Confirm jobId matches the intended job",
      "Review deliverable content quality score",
      "Review spec compliance score",
      "Check for forbidden patterns in deliverable",
      "Verify IPFS content is accessible",
      decision === "ACCEPT" ? "Confirm you are ready to accept this delivery" : null,
      decision === "DISPUTE" ? "Confirm grounds for dispute are documented" : null,
    ].filter(Boolean),
    reviewMessage: `Employer review decision for job ${jobId}. ` +
      `Score: ${review?.overallScore ?? "N/A"}/100. ` +
      `Decision: ${decision}. ${reason}`,
    safety: {
      noPrivateKeyInRuntime: true,
      noSigningInRuntime: true,
      noBroadcastInRuntime: true,
    },
  };
}

export async function writeReviewDecision(jobId, review, decision, reason) {
  await ensureReviewDir();

  const pkg = buildReviewDecisionPackage({ jobId, review, decision, reason });
  const hash = sha256(JSON.stringify(pkg));
  const filePath = path.join(REVIEW_ROOT, `job_${jobId}_review_${hash.slice(0, 12)}.json`);

  const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(pkg, null, 2), "utf8");
  await fs.rename(tmp, filePath);

  return { path: filePath, package: pkg, hash };
}

export async function listReviewDecisions() {
  await ensureReviewDir();
  const files = await fs.readdir(REVIEW_ROOT);
  const decisions = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await fs.readFile(path.join(REVIEW_ROOT, file), "utf8");
      decisions.push(JSON.parse(content));
    } catch {
      // skip unreadable files
    }
  }

  return decisions.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
}
