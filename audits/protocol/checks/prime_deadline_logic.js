// audits/protocol/checks/prime_deadline_logic.js
// Validates that PRIME job deadline logic is correctly enforced in agent source.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "protocol.prime_deadline_logic";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules");
 
// Indicators that deadline checking is implemented
const DEADLINE_INDICATORS = [
  "deadline",
  "expiry",
  "expiresAt",
  "isExpired",
  "validUntil",
  "block.timestamp",
];
 
// Indicators that deadline is properly enforced (not just read)
const ENFORCEMENT_INDICATORS = [
  "deadline <",
  "deadline >",
  "Date.now() >",
  "Date.now() <",
  "isExpired(",
  "isFresh(",
];
 
export async function run(ctx) {
  const start = Date.now();
  let deadlineFound = false;
  let enforcementFound = false;
 
  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of DEADLINE_INDICATORS) {
      let matches;
      try { matches = await searchInFiles(dir, pattern, JS_FILTER); } catch { continue; }
      if (matches?.length > 0) { deadlineFound = true; break; }
    }
    for (const pattern of ENFORCEMENT_INDICATORS) {
      let matches;
      try { matches = await searchInFiles(dir, pattern, JS_FILTER); } catch { continue; }
      if (matches?.length > 0) { enforcementFound = true; break; }
    }
  }
 
  if (!deadlineFound) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "No deadline-related code found in agent/core — PRIME deadline logic may be missing",
      durationMs: Date.now() - start,
    });
  } else if (!enforcementFound) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Deadline referenced but no enforcement comparison detected — may not be actively checked",
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "Deadline logic detected and enforcement pattern found in source",
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}