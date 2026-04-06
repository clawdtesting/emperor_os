// audits/recovery/run.js
// Recovery audit family — verify that the system can recover from
// crashes, restarts, and partial failures. Checks crash recovery,
// duplicate submission prevention, partial state repair, restart/resume,
// and singleton lock enforcement.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as crashMidExecution from "./checks/crash_mid_execution.js";
import * as duplicateSubmissionPrevention from "./checks/duplicate_submission_prevention.js";
import * as partialStateRepair from "./checks/partial_state_repair.js";
import * as restartResume from "./checks/restart_resume.js";
import * as singletonLockEnforcement from "./checks/singleton_lock_enforcement.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  restartResume,
  crashMidExecution,
  partialStateRepair,
  duplicateSubmissionPrevention,
  singletonLockEnforcement,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "recovery" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("recovery", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "recovery");
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
