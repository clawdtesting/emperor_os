// audits/doctrine/checks/no_llm_before_assignment.js
// Enforces doctrine: no LLM invocation before confirmed job assignment.
// Checks the LLM audit log to ensure all recorded LLM calls happened
// after the job reached assigned/in_progress status.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, readText, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "doctrine.no_llm_before_assignment";

const LLM_AUDIT_LOG = `${AGENT_ROOT}/state/llm_audit.jsonl`;
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const PRE_ASSIGNMENT_STATUSES = [
  "open",
  "pending",
  "discovered",
  "inspected",
  "applied",
  "available",
];

export async function run(ctx) {
  const start = Date.now();

  const logExists = await fileExists(LLM_AUDIT_LOG);
  if (!logExists) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "LLM audit log not found — cannot verify pre-assignment calls",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  let logContent;
  try {
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
  const violations = [];

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    const jobId = entry.jobId || entry.job_id;
    const statusAtCall = (entry.statusAtCall || entry.status_at_call || "").toLowerCase();

    if (!jobId || !statusAtCall) continue;

    if (PRE_ASSIGNMENT_STATUSES.includes(statusAtCall)) {
      violations.push(`job ${jobId}: LLM called at status "${statusAtCall}"`);
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} LLM call(s) made before job assignment: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All LLM calls occurred after confirmed job assignment (${lines.length} log entries checked)`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
