// audits/economics/run.js
// Economics audit family — verify that job application decisions are
// economically sound. Checks selectivity, cost/reward ratios, expected
// value estimation, and filtering of bad jobs.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as applicationSelectivity from "./checks/application_selectivity.js";
import * as badJobFiltering from "./checks/bad_job_filtering.js";
import * as costRewardRatio from "./checks/cost_reward_ratio.js";
import * as expectedValueEstimation from "./checks/expected_value_estimation.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  applicationSelectivity,
  badJobFiltering,
  costRewardRatio,
  expectedValueEstimation,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "economics" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("economics", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "economics");
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
