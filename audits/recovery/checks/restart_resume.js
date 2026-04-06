// audits/recovery/checks/restart_resume.js
// Verifies source has restart/resume logic to continue interrupted jobs.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "recovery.restart_resume";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules");
 
const RESUME_INDICATORS = [
  "resume(",
  "restart(",
  "recoverState",
  "loadState",
  "restoreState",
  "checkpointState",
  "saveCheckpoint",
  "resumeFromCheckpoint",
];
 
export async function run(ctx) {
  const start = Date.now();
  let found = false;
  const evidence = [];
 
  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of RESUME_INDICATORS) {
      let matches;
      try { matches = await searchInFiles(dir, pattern, JS_FILTER); } catch { continue; }
      if (matches?.length > 0) {
        found = true;
        evidence.push(`${pattern} in ${matches[0].file}:${matches[0].line}`);
      }
    }
  }
 
  if (!found) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "No restart/resume logic detected — interrupted jobs may not be recoverable",
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Restart/resume logic found: ${evidence.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}