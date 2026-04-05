// audits/recovery/checks/singleton_lock_enforcement.js
// Verifies that singleton lock mechanism exists in source to prevent concurrent runs.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "recovery.singleton_lock_enforcement";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules");
 
const LOCK_INDICATORS = [
  "lockfile",
  "lock_file",
  "singleton",
  ".lock",
  "pid",
  "PID_FILE",
  "createLock",
  "acquireLock",
  "releaseLock",
];
 
export async function run(ctx) {
  const start = Date.now();
  let lockFound = false;
  const foundIn = [];
 
  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of LOCK_INDICATORS) {
      let matches;
      try { matches = await searchInFiles(dir, pattern, JS_FILTER); } catch { continue; }
      if (matches?.length > 0) {
        lockFound = true;
        foundIn.push(`${pattern} in ${matches[0].file}`);
        break;
      }
    }
    if (lockFound) break;
  }
 
  if (!lockFound) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "No singleton lock mechanism detected in agent/core — concurrent execution may not be prevented",
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Singleton lock mechanism found: ${foundIn.join(", ")}`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}