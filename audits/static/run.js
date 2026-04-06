// audits/static/run.js
// Static audit runner — fast code/config inspection without running the system.

import { buildAuditContext, addCheck } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { highestSeverity } from "../lib/severity.js";

const CHECKS = [
  { name: "workspace_boundary", path: "./checks/workspace_boundary.js" },
  { name: "forbidden_signing_calls", path: "./checks/forbidden_signing_calls.js" },
  { name: "forbidden_broadcast_calls", path: "./checks/forbidden_broadcast_calls.js" },
  { name: "env_contracts", path: "./checks/env_contracts.js" },
  { name: "required_files", path: "./checks/required_files.js" },
  { name: "config_sanity", path: "./checks/config_sanity.js" },
  { name: "doctrine_enforcement", path: "./checks/doctrine_enforcement.js" },
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "static" });
  const allChecks = [];

  for (const check of CHECKS) {
    try {
      const mod = await import(check.path);
      const results = await mod.run(ctx);
      allChecks.push(...results);
    } catch (err) {
      allChecks.push({
        name: check.name,
        status: "critical",
        details: `Check execution failed: ${err.message}`,
      });
    }
  }

  const report = buildAuditReport("static", allChecks);

  if (!opts.skipWrite) {
    await writeFullReport(report, "static");
  }

  return report;
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith("static/run.js")) {
  const report = await run();
  const status = report.status;
  const emoji = status === "pass" ? "✅" : status === "warn" ? "⚠️" : "❌";
  console.log(`\n${emoji} Static Audit: ${status.toUpperCase()}`);
  console.log(`  Pass: ${report.summary.pass} | Warn: ${report.summary.warn} | Fail: ${report.summary.fail} | Critical: ${report.summary.critical}`);
  for (const c of report.checks) {
    const e = c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
    console.log(`  ${e} ${c.name}: ${c.status}`);
    if (c.details && c.status !== "pass") {
      console.log(`     ${c.details.split("\n").slice(0, 3).join("\n     ")}`);
    }
  }
  console.log(`  Duration: ${report.durationMs}ms\n`);
  process.exit(status === "pass" ? 0 : 1);
}
