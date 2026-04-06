// audits/performance/run.js
// Performance audit family — measure and validate latency, memory usage,
// LLM budget consumption, and build times across the system.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as discoveryLatency from "./checks/discovery_latency.js";
import * as executionLatency from "./checks/execution_latency.js";
import * as llmBudgetUsage from "./checks/llm_budget_usage.js";
import * as memoryUsage from "./checks/memory_usage.js";
import * as packageBuildLatency from "./checks/package_build_latency.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  discoveryLatency,
  executionLatency,
  llmBudgetUsage,
  memoryUsage,
  packageBuildLatency,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "performance" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("performance", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "performance");
  return report;
}

if (process.argv[1] === __filename) {
  run().then(r => {
    console.log(JSON.stringify(r.summary, null, 2));
    process.exit(r.status === "pass" ? 0 : 1);
  }).catch(err => {
    console.error(err.message);
    process.exit(2);
  });
}
