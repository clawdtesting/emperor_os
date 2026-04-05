// audits/recovery/checks/duplicate_submission_prevention.js
// Checks that source code has duplicate-submission guards (idempotency checks).
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "recovery.duplicate_submission_prevention";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules");
 
const IDEMPOTENCY_INDICATORS = [
  "alreadySubmitted",
  "isDuplicate",
  "submissionId",
  "dedup",
  "idempotent",
  "hasSubmitted",
  "submission_exists",
  "jobId.*submitted",
];
 
export async function run(ctx) {
  const start = Date.now();
  let found = false;
  const foundIn = [];
 
  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of IDEMPOTENCY_INDICATORS) {
      let matches;
      try { matches = await searchInFiles(dir, pattern, JS_FILTER); } catch { continue; }
      if (matches?.length > 0) {
        found = true;
        foundIn.push(`${pattern}`);
        break;
      }
    }
    if (found) break;
  }
 
  if (!found) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "No duplicate submission guard detected in source — idempotency may not be enforced",
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Duplicate submission prevention detected (${foundIn.join(", ")})`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}