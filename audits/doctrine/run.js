// audits/doctrine/run.js
// Doctrine audit family — enforce the immutable rules from AGENTS.md.
// These are not guidelines. They are load-bearing constraints on which
// the safety and correctness of the system depends.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as deterministicScoring from "./checks/deterministic_scoring_required.js";
import * as maxOneLlmCall from "./checks/max_one_llm_call_per_job.js";
import * as noLlmBeforeAssignment from "./checks/no_llm_before_assignment.js";
import * as unsignedHandoffOnly from "./checks/unsigned_handoff_only.js";
import * as workspaceScopeOnly from "./checks/workspace_scope_only.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  maxOneLlmCall,
  noLlmBeforeAssignment,
  unsignedHandoffOnly,
  deterministicScoring,
  workspaceScopeOnly,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "doctrine" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("doctrine", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "doctrine");
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
