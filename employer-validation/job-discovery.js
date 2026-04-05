// employer-validation/job-discovery.js
// Discovers jobs posted by the employer that have pending submissions.
//
// Scans for jobs where:
//   - The employer address matches our configured EMPLOYER_ADDRESS
//   - The job status is "submitted" or "completion_pending_review"
//   - A completionURI exists (agent has submitted work)
//
// SAFETY CONTRACT: Read-only. No signing. No broadcasting.

import { getJob, listJobs } from "../agent/mcp.js";
import { normalizeJob } from "../agent/job-normalize.js";
import { EMPLOYER_CONFIG } from "./config.js";

const PENDING_STATUSES = new Set([
  "submitted",
  "completion_pending_review",
]);

const TERMINAL_STATUSES = new Set([
  "completed",
  "disputed",
  "rejected",
  "expired",
  "cancelled",
  "canceled",
  "closed",
]);

export async function discoverEmployerJobs(employerAddress = null) {
  const employer = (employerAddress ?? EMPLOYER_CONFIG.EMPLOYER_ADDRESS).toLowerCase();
  if (!employer) {
    throw new Error("EMPLOYER_ADDRESS not set — cannot discover employer jobs");
  }

  const allJobs = await listJobs();
  const employerJobs = [];

  for (const rawJob of allJobs) {
    const job = normalizeJob(rawJob);

    // Check if this job belongs to our employer
    const jobEmployer = String(job.employer ?? job.raw?.employer ?? "").toLowerCase();
    if (jobEmployer !== employer) continue;

    employerJobs.push({
      jobId: job.jobId,
      status: job.status,
      payout: job.payout,
      specURI: job.jobSpecURI,
      completionURI: job.completionURI,
      assignedAgent: job.assignedAgent,
      deadline: job.raw?.deadline ?? null,
      createdAt: job.raw?.createdAt ?? null,
      isPending: PENDING_STATUSES.has(String(job.status).toLowerCase()),
      isTerminal: TERMINAL_STATUSES.has(String(job.status).toLowerCase()),
      raw: job.raw,
    });
  }

  return {
    employer,
    totalJobs: employerJobs.length,
    pendingJobs: employerJobs.filter(j => j.isPending),
    terminalJobs: employerJobs.filter(j => j.isTerminal),
    all: employerJobs,
    discoveredAt: new Date().toISOString(),
  };
}

export async function getEmployerJobDetails(jobId, employerAddress = null) {
  const employer = (employerAddress ?? EMPLOYER_CONFIG.EMPLOYER_ADDRESS).toLowerCase();
  if (!employer) {
    throw new Error("EMPLOYER_ADDRESS not set");
  }

  const rawJob = await getJob(Number(jobId));
  const job = normalizeJob(rawJob);

  const jobEmployer = String(job.employer ?? job.raw?.employer ?? "").toLowerCase();
  if (jobEmployer !== employer) {
    throw new Error(`Job ${jobId} does not belong to employer ${employer}`);
  }

  return {
    jobId: job.jobId,
    status: job.status,
    payout: job.payout,
    specURI: job.jobSpecURI,
    completionURI: job.completionURI,
    assignedAgent: job.assignedAgent,
    details: job.details,
    deadline: job.raw?.deadline ?? null,
    createdAt: job.raw?.createdAt ?? null,
    needsReview: PENDING_STATUSES.has(String(job.status).toLowerCase()),
    hasSubmission: !!job.completionURI,
    raw: job.raw,
  };
}

export async function listPendingReviews(employerAddress = null) {
  const discovery = await discoverEmployerJobs(employerAddress);
  return discovery.pendingJobs.filter(j => j.hasSubmission);
}
