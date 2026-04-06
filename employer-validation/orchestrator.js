// employer-validation/orchestrator.js
// Employer-side validation orchestrator.
//
// Ties together discovery → review → decision pipeline:
//   1. Discover jobs posted by the employer with pending submissions
//   2. Fetch and review each deliverable
//   3. Generate review reports with scores and recommendations
//   4. Write decision packages for operator review
//
// Usage:
//   node employer-validation/orchestrator.js              # review all pending
//   node employer-validation/orchestrator.js <jobId>      # review specific job
//   node employer-validation/orchestrator.js --list       # list all employer jobs
//
// SAFETY CONTRACT: Read-only + file I/O. No signing. No broadcasting.

import { listPendingReviews, getEmployerJobDetails, discoverEmployerJobs } from "./job-discovery.js";
import { reviewDeliverable, batchReviewDeliverables } from "./deliverable-review.js";
import { writeReviewDecision, listReviewDecisions } from "./tx-builder.js";
import { EMPLOYER_CONFIG } from "./config.js";

function log(msg) {
  console.log(`[employer-validation] ${new Date().toISOString()} ${msg}`);
}

async function reviewSingleJob(jobId) {
  log(`Reviewing job ${jobId}...`);

  const job = await getEmployerJobDetails(jobId);
  log(`Job ${jobId}: status=${job.status}, completionURI=${job.completionURI || "none"}`);

  if (!job.hasSubmission) {
    log(`Job ${jobId}: no submission yet — nothing to review`);
    return { jobId, status: job.status, error: "No submission" };
  }

  if (!job.needsReview) {
    log(`Job ${jobId}: status=${job.status} — not in review state`);
    return { jobId, status: job.status, error: "Not pending review" };
  }

  const review = await reviewDeliverable(job.jobId, job.completionURI);
  const rec = review.recommendation;

  log(`Job ${jobId}: score=${review.overallScore}, recommendation=${rec.action} (${rec.reason})`);

  const decisionPkg = await writeReviewDecision(jobId, review, rec.action, rec.reason);
  log(`Review decision written to ${decisionPkg.path}`);

  return { jobId, review, decision: decisionPkg };
}

async function reviewAllPending() {
  const pending = await listPendingReviews();

  if (pending.length === 0) {
    log("No pending submissions to review");
    return [];
  }

  log(`Found ${pending.length} pending submission(s)`);

  const results = await batchReviewDeliverables(pending);

  for (const result of results) {
    if (result.error) {
      log(`Job ${result.jobId}: ERROR — ${result.error}`);
      continue;
    }
    const rec = result.recommendation;
    log(`Job ${result.jobId}: score=${result.overallScore}, recommendation=${rec.action}`);
    await writeReviewDecision(result.jobId, result, rec.action, rec.reason);
  }

  return results;
}

async function listAllJobs() {
  const discovery = await discoverEmployerJobs();

  log(`Employer: ${discovery.employer}`);
  log(`Total jobs: ${discovery.totalJobs}`);
  log(`Pending review: ${discovery.pendingJobs.length}`);
  log(`Terminal: ${discovery.terminalJobs.length}`);

  if (discovery.all.length > 0) {
    console.log("\n══ Employer Jobs ═══════════════════════════════════════");
    for (const job of discovery.all) {
      const icon = job.isPending ? "⏳" : job.isTerminal ? "✓" : "·";
      console.log(`  ${icon} Job ${job.jobId}: ${job.status} | payout=${job.payout} | agent=${job.assignedAgent || "none"}`);
      if (job.completionURI) console.log(`    completionURI: ${job.completionURI}`);
    }
    console.log("═══════════════════════════════════════════════════════\n");
  }

  return discovery;
}

async function listDecisions() {
  const decisions = await listReviewDecisions();

  if (decisions.length === 0) {
    log("No review decisions recorded");
    return [];
  }

  log(`Found ${decisions.length} review decision(s)`);
  console.log("\n══ Review Decisions ════════════════════════════════════");
  for (const d of decisions) {
    console.log(`  Job ${d.jobId}: ${d.decision} (score=${d.reviewScore}) — ${d.reason}`);
    console.log(`    ${d.generatedAt}`);
  }
  console.log("═══════════════════════════════════════════════════════\n");

  return decisions;
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("orchestrator.js")) {
  const arg = process.argv[2];

  if (!arg) {
    reviewAllPending().catch(err => {
      console.error("[employer-validation] Fatal:", err.message);
      process.exit(1);
    });
  } else if (arg === "--list") {
    listAllJobs().catch(err => {
      console.error("[employer-validation] Fatal:", err.message);
      process.exit(1);
    });
  } else if (arg === "--decisions") {
    listDecisions().catch(err => {
      console.error("[employer-validation] Fatal:", err.message);
      process.exit(1);
    });
  } else if (/^\d+$/.test(arg)) {
    reviewSingleJob(arg).catch(err => {
      console.error("[employer-validation] Fatal:", err.message);
      process.exit(1);
    });
  } else {
    console.log("Usage:");
    console.log("  node employer-validation/orchestrator.js              # review all pending");
    console.log("  node employer-validation/orchestrator.js <jobId>      # review specific job");
    console.log("  node employer-validation/orchestrator.js --list       # list all employer jobs");
    console.log("  node employer-validation/orchestrator.js --decisions  # list review decisions");
    process.exit(1);
  }
}
