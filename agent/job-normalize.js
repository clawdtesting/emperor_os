// agent/job-normalize.js
// Normalize raw MCP job payloads to a common schema.
// Handles both v1 and v2 response formats.

/**
 * Normalize a raw MCP list_jobs or get_job entry to a canonical shape.
 * Adapters tag entries with _contractVersion before this is called.
 */
export function normalizeJob(entry) {
  if (!entry || typeof entry !== "object") return null;

  const jobId =
    entry.jobId ?? entry.id ?? entry.job_id ?? null;

  const status =
    entry.status ?? entry.jobStatus ?? "";

  const payout =
    entry.payout ?? entry.payoutAGIALPHA ?? entry.payoutAmount ?? null;

  const jobSpecURI =
    entry.jobSpecURI ?? entry.specURI ?? entry.specUri ?? entry.jobSpecUri ?? null;

  const assignedAgent =
    entry.assignedAgent ?? entry.assigned_agent ?? entry.agent ?? null;

  const employer =
    entry.employer ?? entry.creator ?? null;

  const details =
    entry.details ?? entry.description ?? "";

  const duration =
    entry.duration ?? entry.durationDays ?? entry.durationSeconds ?? null;

  return {
    jobId: jobId != null ? String(jobId) : null,
    status: String(status),
    payout,
    jobSpecURI,
    assignedAgent: assignedAgent ? String(assignedAgent) : null,
    employer: employer ? String(employer) : null,
    details: String(details),
    duration,
    _contractVersion: entry._contractVersion ?? null,
    raw: entry,
  };
}

/**
 * Parse a payout value to a number.
 */
export function parsePayoutNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Check if a normalized job is assigned to a specific address.
 */
export function isAssignedToAddress(job, address) {
  if (!job?.assignedAgent || !address) return false;
  return String(job.assignedAgent).toLowerCase() === String(address).toLowerCase();
}
