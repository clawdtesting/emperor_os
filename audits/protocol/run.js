// audits/protocol/run.js
// Protocol audit family — validate on-chain transaction structure and
// encoding. Checks calldata encoding/decoding, chain ID validation,
// contract address validation, ERC20 approval flows, function selector
// validation, and Prime deadline logic.

import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";

import * as calldataDecoding from "./checks/calldata_decoding.js";
import * as calldataEncoding from "./checks/calldata_encoding.js";
import * as chainidValidation from "./checks/chainid_validation.js";
import * as contractAddressValidation from "./checks/contract_address_validation.js";
import * as erc20ApprovalFlow from "./checks/erc20_approval_flow.js";
import * as functionSelectorValidation from "./checks/function_selector_validation.js";
import * as primeDeadlineLogic from "./checks/prime_deadline_logic.js";

const __filename = fileURLToPath(import.meta.url);

const CHECKS = [
  chainidValidation,
  contractAddressValidation,
  functionSelectorValidation,
  calldataEncoding,
  calldataDecoding,
  erc20ApprovalFlow,
  primeDeadlineLogic,
];

export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "protocol" });
  const startMs = Date.now();

  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }

  const report = buildAuditReport("protocol", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "protocol");
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
