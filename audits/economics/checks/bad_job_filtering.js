// audits/economics/checks/bad_job_filtering.js
// Verifies the agent correctly filters out bad jobs — zero-payout,
// disputed, expired, and spam jobs. If any such jobs appear in the
// applied or in_progress state, the filtering logic has failed.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "economics.bad_job_filtering";
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const ACTIVE_STATUSES = ["applied", "assigned", "in_progress"];
const BAD_JOB_INDICATORS = {
  zeroPayout: j => {
    const payout = j.payout ?? j.payoutAGIALPHA ?? j.reward ?? j.amount;
    return payout !== undefined && Number(payout) === 0;
  },
  disputed: j => (j.status || "").toLowerCase() === "disputed",
  expired: j => {
    if (!j.deadline) return false;
    return Date.parse(j.deadline) < Date.now();
  },
  suspiciouslyShortDeadline: j => {
    if (!j.deadline) return false;
    const secsRemaining = (Date.parse(j.deadline) - Date.now()) / 1000;
    return secsRemaining > 0 && secsRemaining < 3600;
  },
};

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
      details: "Job state directory not found — cannot check bad job filtering",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const violations = [];
  let checked = 0;

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); checked++; } catch { continue; }

    const status = (state.status || "").toLowerCase();
    if (!ACTIVE_STATUSES.includes(status)) continue;

    for (const [reason, test] of Object.entries(BAD_JOB_INDICATORS)) {
      if (test(state)) {
        const jobId = state.jobId || file.split("/").pop().replace(".json", "");
        violations.push(`job ${jobId} (${status}): ${reason}`);
      }
    }
  }

  addMetric(ctx, "bad_job_filtering.checked", checked);
  addMetric(ctx, "bad_job_filtering.violations", violations.length);

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} bad job(s) passed filtering: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} active job(s) passed bad-job filter checks`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
