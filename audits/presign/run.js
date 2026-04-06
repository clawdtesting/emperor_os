// audits/presign/run.js
// Pre-sign audit family — validate every aspect of a transaction package
// before it is handed to the operator for signing. Checks chain ID,
// selector, calldata, target contract, freshness, manifest binding,
// and simulation requirements.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as argumentMatch from "./checks/argument_match.js";
import * as chainidMainnetOnly from "./checks/chainid_mainnet_only.js";
import * as decodeAndCompare from "./checks/decode_and_compare.js";
import * as freshnessWindow from "./checks/freshness_window.js";
import * as manifestBinding from "./checks/manifest_binding.js";
import * as selectorMatch from "./checks/selector_match.js";
import * as simulationPassRequired from "./checks/simulation_pass_required.js";
import * as targetContractMatch from "./checks/target_contract_match.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  chainidMainnetOnly,
  selectorMatch,
  argumentMatch,
  targetContractMatch,
  decodeAndCompare,
  freshnessWindow,
  manifestBinding,
  simulationPassRequired,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "presign" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("presign", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "presign");
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
