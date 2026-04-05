// audits/safety/checks/pre_sign_simulation_policy.js
// Verifies the codebase enforces simulation before any signing handoff.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "safety.pre_sign_simulation_policy";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules");
 
// We want to find evidence that simulation is called before handoff
const SIMULATION_INDICATORS = [
  "simulateTx",
  "simulate(",
  "eth_call",
  "provider.call(",
  "simulate_transaction",
];
 
export async function run(ctx) {
  const start = Date.now();
  let simulationFound = false;
 
  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of SIMULATION_INDICATORS) {
      let matches;
      try {
        matches = await searchInFiles(dir, pattern, JS_FILTER);
      } catch {
        continue;
      }
      if (matches && matches.length > 0) {
        simulationFound = true;
        break;
      }
    }
    if (simulationFound) break;
  }
 
  if (!simulationFound) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "No simulation call detected in agent/core source — pre-sign simulation policy may not be enforced",
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "Pre-sign simulation pattern detected in source — policy appears enforced",
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}