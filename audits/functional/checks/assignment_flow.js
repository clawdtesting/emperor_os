// audits/functional/checks/assignment_flow.js
// Verifies the job assignment flow works correctly.
// Checks that jobs transition through valid state sequences:
// open → applied → assigned → in_progress.
// Flags invalid transitions, stuck states, and missing state files.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "functional.assignment_flow";
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const VALID_TRANSITIONS = {
  open:        ["applied", "skipped"],
  applied:     ["assigned", "rejected", "skipped"],
  assigned:    ["in_progress", "disputed"],
  in_progress: ["completion_ready", "completed", "disputed"],
  completion_ready: ["completed"],
  completed:   [],
  done:        [],
  disputed:    ["resolved"],
  skipped:     [],
  rejected:    [],
};

const STUCK_THRESHOLD_HOURS = 48;

function isStuck(state) {
  const updatedAt = state.updatedAt || state.lastSync || state.assignedAt;
  if (!updatedAt) return false;
  const ageHours = (Date.now() - Date.parse(updatedAt)) / 3600000;
  const status = (state.status || "").toLowerCase();
  return ageHours > STUCK_THRESHOLD_HOURS && ["applied", "assigned", "in_progress"].includes(status);
}

export async function run(ctx) {
  const start = Date.now();

  let jobFiles;
  try {
    jobFiles = await listFiles(JOB_STATE_DIR, f => f.endsWith(".json"));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Job state directory not found — cannot verify assignment flow",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const issues = [];
  let checked = 0;

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); checked++; } catch { continue; }

    const status = (state.status || "").toLowerCase();
    const previousStatus = (state.previousStatus || state.prevStatus || "").toLowerCase();
    const jobId = state.jobId || file.split("/").pop().replace(".json", "");

    if (previousStatus && VALID_TRANSITIONS[previousStatus] !== undefined) {
      const allowed = VALID_TRANSITIONS[previousStatus];
      if (!allowed.includes(status)) {
        issues.push(`job ${jobId}: invalid transition ${previousStatus} → ${status}`);
      }
    }

    if (isStuck(state)) {
      const ageHours = Math.round((Date.now() - Date.parse(state.updatedAt || state.lastSync)) / 3600000);
      issues.push(`job ${jobId}: stuck in "${status}" for ${ageHours}h`);
    }
  }

  if (issues.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `${issues.length} assignment flow issue(s) across ${checked} job(s): ${issues.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { issues, checked },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Assignment flow valid for all ${checked} job(s)`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
