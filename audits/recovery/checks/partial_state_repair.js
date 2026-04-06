// audits/recovery/checks/partial_state_repair.js
// Tests that partial state fixtures can be identified and marked for repair.
 
import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { loadAllFixtures } from "../../lib/fixture_utils.js";
 
const CHECK_NAME = "recovery.partial_state_repair";
 
// Fields that must be present for a state to be considered repairable
const REPAIRABLE_MARKERS = ["jobId", "status"];
 
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
      details: "No state fixtures — partial state repair test skipped",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  if (fixtures.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No state fixtures — partial state repair not applicable",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  const unrecoverable = [];
  let repairable = 0;
  let healthy = 0;
 
  for (const { name, data } of fixtures) {
    const status = data.status?.toLowerCase();
 
    if (status === "complete" || status === "done") {
      healthy++;
      continue;
    }
 
    // Partial state must at least have jobId + status to be repairable
    const hasMarkers = REPAIRABLE_MARKERS.every(k => data[k] !== undefined);
    if (!hasMarkers) {
      unrecoverable.push(`${name}: missing required repair markers`);
    } else {
      repairable++;
    }
  }
 
  addMetric(ctx, "partial_repair.fixtures", fixtures.length);
  addMetric(ctx, "partial_repair.healthy", healthy);
  addMetric(ctx, "partial_repair.repairable", repairable);
  addMetric(ctx, "partial_repair.unrecoverable", unrecoverable.length);
 
  if (unrecoverable.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.FAIL,
      severity: SEVERITY.FAIL,
      details: `${unrecoverable.length} unrecoverable state(s): ${unrecoverable.join("; ")}`,
      durationMs: Date.now() - start,
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `State repair check passed — ${healthy} healthy, ${repairable} repairable, 0 unrecoverable`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}