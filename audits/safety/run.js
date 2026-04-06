// audits/safety/run.js
// Safety audit family — prove the worker cannot do forbidden on-chain actions.
 
import { fileURLToPath } from "url";
import { buildAuditContext, addError } from "../lib/audit_context.js";
import { buildAuditReport } from "../lib/report_builder.js";
import { writeFullReport } from "../lib/result_writer.js";
import { elapsedMs } from "../lib/time_utils.js";
 
import * as antiReplay from "./checks/anti_replay_freshness.js";
import * as noPrivateKey from "./checks/no_private_key_usage.js";
import * as noSignerSend from "./checks/no_signer_send_transaction.js";
import * as preSignPolicy from "./checks/pre_sign_simulation_policy.js";
import * as manifestIntegrity from "./checks/signing_manifest_integrity.js";
import * as unsignedOnly from "./checks/unsigned_only_guarantee.js";
 
const __filename = fileURLToPath(import.meta.url);
 
const CHECKS = [
  noPrivateKey,
  noSignerSend,
  unsignedOnly,
  antiReplay,
  preSignPolicy,
  manifestIntegrity,
];
 
export async function run(opts = {}) {
  const ctx = buildAuditContext({ ...opts, auditFamily: "safety" });
  const startMs = Date.now();
 
  for (const check of CHECKS) {
    try {
      await check.run(ctx);
    } catch (err) {
      addError(ctx, err);
    }
  }
 
  const report = buildAuditReport("safety", ctx.checks, ctx.metrics);
  report.elapsedMs = elapsedMs(startMs);
  report.errors = ctx.errors;
  await writeFullReport(report, "safety");
  return report;
}

export default { run };
 
if (process.argv[1] === __filename) {
  run().then(r => {
    console.log(JSON.stringify(r.summary, null, 2));
    process.exit(r.status === "pass" ? 0 : 1);
  }).catch(err => {
    console.error(err.message);
    process.exit(2);
  });
}
