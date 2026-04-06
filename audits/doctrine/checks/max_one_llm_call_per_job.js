// audits/doctrine/checks/max_one_llm_call_per_job.js
// Enforces doctrine: max one LLM call per job. The LLM call budget is
// tracked via an append-only audit log. If more than one LLM call is
// recorded for a single job, this check fires CRITICAL.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "doctrine.max_one_llm_call_per_job";

const LLM_AUDIT_LOG = `${AGENT_ROOT}/state/llm_audit.jsonl`;
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

export async function run(ctx) {
  const start = Date.now();

  const logExists = await fileExists(LLM_AUDIT_LOG);
  if (!logExists) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "LLM audit log not found — cannot verify call budget",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  let logContent;
  try {
    const { readText } = await import("../../lib/fs_utils.js");
    logContent = await readText(LLM_AUDIT_LOG);
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "LLM audit log unreadable",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const lines = logContent.trim().split("\n").filter(Boolean);
  const callsByJob = {};

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const jobId = entry.jobId || entry.job_id;
      if (!jobId) continue;
      callsByJob[jobId] = (callsByJob[jobId] || 0) + 1;
    } catch {
      continue;
    }
  }

  const violations = Object.entries(callsByJob)
    .filter(([, count]) => count > 1)
    .map(([jobId, count]) => `job ${jobId}: ${count} LLM calls`);

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} job(s) exceeded 1 LLM call: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations, totalJobs: Object.keys(callsByJob).length },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${Object.keys(callsByJob).length} job(s) within 1 LLM call budget`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
