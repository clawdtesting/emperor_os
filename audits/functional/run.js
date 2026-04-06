// audits/functional/run.js
// Functional audit family — end-to-end mock tests for AGIJobManager
// and Prime discovery pipelines. Verifies artifact flow, assignment,
// and completion package handling work correctly.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as agiJobManagerE2e from "./checks/agijobmanager_e2e_mock.js";
import * as artifactFlow from "./checks/artifact_flow.js";
import * as assignmentFlow from "./checks/assignment_flow.js";
import * as completionPackageFlow from "./checks/completion_package_flow.js";
import * as primeE2e from "./checks/prime_e2e_mock.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  agiJobManagerE2e,
  primeE2e,
  assignmentFlow,
  artifactFlow,
  completionPackageFlow,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "functional" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("functional", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "functional");
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
