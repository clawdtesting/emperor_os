// audits/economics/checks/application_selectivity.js
// Measures how selective the agent is when applying to jobs.
// Applying to everything is economically wasteful. A healthy application
// rate is < 50% of discovered jobs. Flags if the agent is applying
// indiscriminately or not applying at all.

import { addCheck, addMetric } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "economics.application_selectivity";

const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;
const MIN_SELECTIVITY_RATE = 0.1;
const MAX_APPLICATION_RATE = 0.8;

export async function run(ctx) {
  const start = Date.now();

  let jobFiles;
  try {
    jobFiles = await listFiles(JOB_STATE_DIR, f => f.endsWith(".json"));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Job state directory not found — cannot assess selectivity",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  if (jobFiles.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No job state files found — nothing to assess",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  let discovered = 0;
  let applied = 0;
  let skipped = 0;

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); } catch { continue; }

    const status = (state.status || "").toLowerCase();
    discovered++;

    if (["applied", "assigned", "in_progress", "completed", "done"].includes(status)) {
      applied++;
    } else if (["skipped", "rejected", "filtered", "declined"].includes(status)) {
      skipped++;
    }
  }

  const applicationRate = discovered > 0 ? applied / discovered : 0;

  addMetric(ctx, "application_selectivity.discovered", discovered);
  addMetric(ctx, "application_selectivity.applied", applied);
  addMetric(ctx, "application_selectivity.skipped", skipped);
  addMetric(ctx, "application_selectivity.rate", applicationRate);

  if (applicationRate > MAX_APPLICATION_RATE) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `Application rate too high: ${(applicationRate * 100).toFixed(1)}% (${applied}/${discovered}) — agent may be applying indiscriminately`,
      durationMs: Date.now() - start,
      extra: { discovered, applied, skipped, applicationRate },
    });
  } else if (applicationRate < MIN_SELECTIVITY_RATE && discovered > 10) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `Application rate very low: ${(applicationRate * 100).toFixed(1)}% (${applied}/${discovered}) — agent may be over-filtering`,
      durationMs: Date.now() - start,
      extra: { discovered, applied, skipped, applicationRate },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Application rate healthy: ${(applicationRate * 100).toFixed(1)}% (${applied}/${discovered} jobs)`,
      durationMs: Date.now() - start,
      extra: { discovered, applied, skipped, applicationRate },
    });
  }

  return ctx;
}
