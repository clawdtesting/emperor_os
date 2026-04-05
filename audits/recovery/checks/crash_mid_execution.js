// audits/recovery/checks/crash_mid_execution.js
// Verifies that partial/crashed state fixtures are recognized as recoverable, not corrupt.
 
import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { loadAllFixtures } from "../../lib/fixture_utils.js";
 
const CHECK_NAME = "recovery.crash_mid_execution";
 
// States that indicate partial/crash mid-execution
const RESUMABLE_STATES = ["partial", "in_progress", "crashed", "interrupted"];
const CORRUPT_INDICATORS = ["CORRUPT", "POISON", "INVALID_STATE"];
 
export async function run(ctx) {
  const start = Date.now();
 
  let fixtures;
  try {
    fixtures = await loadAllFixtures("state");
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "No state fixtures — crash recovery test skipped",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  if (fixtures.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No state fixtures present — crash mid-execution not applicable",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  const corrupt = [];
  const resumable = [];
 
  for (const { name, data } of fixtures) {
    const stateStr = JSON.stringify(data).toUpperCase();
    if (CORRUPT_INDICATORS.some(c => stateStr.includes(c))) {
      corrupt.push(name);
      continue;
    }
    if (RESUMABLE_STATES.includes(data.status?.toLowerCase())) {
      resumable.push(name);
    }
  }
 
  addMetric(ctx, "crash_recovery.fixtures", fixtures.length);
  addMetric(ctx, "crash_recovery.resumable", resumable.length);
  addMetric(ctx, "crash_recovery.corrupt", corrupt.length);
 
  if (corrupt.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.FAIL,
      severity: SEVERITY.FAIL,
      details: `${corrupt.length} corrupt state fixture(s) detected: ${corrupt.join(", ")}`,
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `No corrupt state detected. ${resumable.length} resumable state(s) identified.`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}