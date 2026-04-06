// audits/performance/checks/execution_latency.js
// Measures how long job execution stages take by reading timestamps
// from persisted state files. Flags jobs that took too long to move
// from assigned to completion_ready — indicating pipeline bottlenecks.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "performance.execution_latency";
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const WARN_THRESHOLD_MS = 30 * 60 * 1000;
const CRITICAL_THRESHOLD_MS = 120 * 60 * 1000;

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
      details: "Job state directory not found — cannot measure execution latency",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const slow = [];
  const latencies = [];

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); } catch { continue; }

    const assignedAt = state.assignedAt || state.startedAt;
    const completedAt = state.completedAt || state.finishedAt;
    if (!assignedAt || !completedAt) continue;

    const latencyMs = Date.parse(completedAt) - Date.parse(assignedAt);
    if (latencyMs < 0) continue;

    latencies.push(latencyMs);
    const jobId = state.jobId || file.split("/").pop().replace(".json", "");

    if (latencyMs > CRITICAL_THRESHOLD_MS) {
      slow.push({ jobId, latencyMs, level: "critical" });
    } else if (latencyMs > WARN_THRESHOLD_MS) {
      slow.push({ jobId, latencyMs, level: "warn" });
    }
  }

  const avgMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const maxMs = latencies.length > 0 ? Math.max(...latencies) : null;

  addMetric(ctx, "execution_latency.avg_ms", avgMs);
  addMetric(ctx, "execution_latency.max_ms", maxMs);
  addMetric(ctx, "execution_latency.slow_count", slow.length);

  const critical = slow.filter(s => s.level === "critical");

  if (critical.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${critical.length} job(s) exceeded ${CRITICAL_THRESHOLD_MS / 60000}min execution time: ${critical.slice(0, 3).map(s => `job ${s.jobId} (${Math.round(s.latencyMs / 60000)}min)`).join(", ")}`,
      durationMs: Date.now() - start,
      extra: { slow, avgMs, maxMs },
    });
  } else if (slow.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `${slow.length} job(s) slow (>${WARN_THRESHOLD_MS / 60000}min). Avg: ${avgMs ? Math.round(avgMs / 1000) + 's' : 'n/a'}`,
      durationMs: Date.now() - start,
      extra: { slow, avgMs, maxMs },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: latencies.length > 0
        ? `Execution latency healthy — ${latencies.length} job(s), avg ${Math.round(avgMs / 1000)}s, max ${Math.round(maxMs / 1000)}s`
        : "No completed jobs with timing data found",
      durationMs: Date.now() - start,
      extra: { avgMs, maxMs },
    });
  }

  return ctx;
}
