// audits/performance/checks/memory_usage.js
// Reports current Node.js process memory usage and flags if heap
// consumption is approaching dangerous levels. A memory-heavy agent
// will be killed by the OS or slow down due to GC pressure.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";

const CHECK_NAME = "performance.memory_usage";

const WARN_HEAP_MB = 400;
const CRITICAL_HEAP_MB = 700;

function toMb(bytes) {
  return Math.round(bytes / 1024 / 1024);
}

export async function run(ctx) {
  const start = Date.now();

  const mem = process.memoryUsage();
  const heapUsedMb = toMb(mem.heapUsed);
  const heapTotalMb = toMb(mem.heapTotal);
  const rssMb = toMb(mem.rss);
  const externalMb = toMb(mem.external);
  const heapPct = Math.round((heapUsedMb / heapTotalMb) * 100);

  addMetric(ctx, "memory.heap_used_mb", heapUsedMb);
  addMetric(ctx, "memory.heap_total_mb", heapTotalMb);
  addMetric(ctx, "memory.rss_mb", rssMb);
  addMetric(ctx, "memory.heap_pct", heapPct);

  if (heapUsedMb > CRITICAL_HEAP_MB) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `Heap usage critical: ${heapUsedMb}MB / ${heapTotalMb}MB (${heapPct}%), RSS: ${rssMb}MB`,
      durationMs: Date.now() - start,
      extra: { heapUsedMb, heapTotalMb, rssMb, externalMb, heapPct },
    });
  } else if (heapUsedMb > WARN_HEAP_MB) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `Heap usage elevated: ${heapUsedMb}MB / ${heapTotalMb}MB (${heapPct}%), RSS: ${rssMb}MB`,
      durationMs: Date.now() - start,
      extra: { heapUsedMb, heapTotalMb, rssMb, externalMb, heapPct },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Memory healthy: heap ${heapUsedMb}MB / ${heapTotalMb}MB (${heapPct}%), RSS: ${rssMb}MB`,
      durationMs: Date.now() - start,
      extra: { heapUsedMb, heapTotalMb, rssMb, externalMb, heapPct },
    });
  }

  return ctx;
}
