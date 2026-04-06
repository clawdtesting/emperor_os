// audits/performance/checks/package_build_latency.js
// Measures how long tx package and completion package builds take
// by reading build timestamps from state files. A slow package build
// blocks the operator from signing and delays on-chain finalization.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "performance.package_build_latency";

const PROC_ARTIFACTS_DIR = `${AGENT_ROOT}/artifacts`;
const WARN_THRESHOLD_MS = 10 * 1000;
const CRITICAL_THRESHOLD_MS = 30 * 1000;

export async function run(ctx) {
  const start = Date.now();

  const slow = [];
  const latencies = [];

  try {
    const dirs = await listFiles(PROC_ARTIFACTS_DIR, f => f.startsWith("proc_"));
    for (const dir of dirs) {
      let state;
      try {
        state = await readJson(`${dir}/state.json`);
      } catch { continue; }

      const buildStartedAt = state.packageBuildStartedAt;
      const buildCompletedAt = state.packageBuildCompletedAt;
      if (!buildStartedAt || !buildCompletedAt) continue;

      const latencyMs = Date.parse(buildCompletedAt) - Date.parse(buildStartedAt);
      if (latencyMs < 0) continue;

      latencies.push(latencyMs);
      const procId = dir.split("/").pop().replace("proc_", "");

      if (latencyMs > CRITICAL_THRESHOLD_MS) {
        slow.push({ id: `proc_${procId}`, latencyMs, level: "critical" });
      } else if (latencyMs > WARN_THRESHOLD_MS) {
        slow.push({ id: `proc_${procId}`, latencyMs, level: "warn" });
      }
    }
  } catch {
    // no proc artifacts — skip
  }

  const avgMs = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const maxMs = latencies.length > 0 ? Math.max(...latencies) : null;

  addMetric(ctx, "package_build_latency.avg_ms", avgMs);
  addMetric(ctx, "package_build_latency.max_ms", maxMs);
  addMetric(ctx, "package_build_latency.slow_count", slow.length);

  const critical = slow.filter(s => s.level === "critical");

  if (critical.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${critical.length} package build(s) exceeded ${CRITICAL_THRESHOLD_MS / 1000}s: ${critical.slice(0, 3).map(s => `${s.id} (${Math.round(s.latencyMs / 1000)}s)`).join(", ")}`,
      durationMs: Date.now() - start,
      extra: { slow, avgMs, maxMs },
    });
  } else if (slow.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `${slow.length} package build(s) slow (>${WARN_THRESHOLD_MS / 1000}s). Avg: ${avgMs ? Math.round(avgMs / 1000) + 's' : 'n/a'}`,
      durationMs: Date.now() - start,
      extra: { slow, avgMs, maxMs },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: latencies.length > 0
        ? `Package build latency healthy — ${latencies.length} build(s), avg ${Math.round(avgMs / 1000)}s, max ${Math.round(maxMs / 1000)}s`
        : "No package build timing data found",
      durationMs: Date.now() - start,
      extra: { avgMs, maxMs },
    });
  }

  return ctx;
}
