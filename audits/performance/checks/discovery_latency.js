// audits/performance/checks/discovery_latency.js
// Measures how long job discovery takes via the MCP endpoint.
// Flags if discovery exceeds acceptable latency thresholds.
// A slow discovery loop means the agent misses time-sensitive jobs.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";

const CHECK_NAME = "performance.discovery_latency";
const TIMEOUT_MS = 10000;
const WARN_THRESHOLD_MS = 3000;
const CRITICAL_THRESHOLD_MS = 7000;

export async function run(ctx) {
  const start = Date.now();

  const endpoint = process.env.AGI_ALPHA_MCP || "https://agialpha.com/api/mcp";

  let latencyMs;

  try {
    const t0 = Date.now();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "list_jobs", args: {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    latencyMs = Date.now() - t0;

    if (!res.ok) {
      addCheck(ctx, {
        name: CHECK_NAME,
        status: SEVERITY.WARN,
        severity: SEVERITY.WARN,
        details: `Discovery endpoint returned HTTP ${res.status} — cannot measure latency`,
        durationMs: Date.now() - start,
      });
      return ctx;
    }
  } catch (err) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `Discovery latency check failed: ${err.message}`,
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  addMetric(ctx, "discovery_latency.ms", latencyMs);

  if (latencyMs > CRITICAL_THRESHOLD_MS) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `Discovery latency critical: ${latencyMs}ms (threshold: ${CRITICAL_THRESHOLD_MS}ms)`,
      durationMs: Date.now() - start,
      extra: { latencyMs, threshold: CRITICAL_THRESHOLD_MS },
    });
  } else if (latencyMs > WARN_THRESHOLD_MS) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `Discovery latency elevated: ${latencyMs}ms (warn threshold: ${WARN_THRESHOLD_MS}ms)`,
      durationMs: Date.now() - start,
      extra: { latencyMs, threshold: WARN_THRESHOLD_MS },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Discovery latency healthy: ${latencyMs}ms`,
      durationMs: Date.now() - start,
      extra: { latencyMs },
    });
  }

  return ctx;
}
