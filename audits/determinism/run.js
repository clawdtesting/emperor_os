// audits/determinism/run.js
// Determinism audit family — verify that scoring, normalization, and
// artifact production are fully deterministic across repeated runs.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as artifactHashStability from "./checks/artifact_hash_stability.js";
import * as normalizedInputConsistency from "./checks/normalized_input_consistency.js";
import * as repeatedRunSameOutput from "./checks/repeated_run_same_output.js";
import * as scoringDeterminism from "./checks/scoring_determinism.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  artifactHashStability,
  normalizedInputConsistency,
  repeatedRunSameOutput,
  scoringDeterminism,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "determinism" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("determinism", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "determinism");
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
