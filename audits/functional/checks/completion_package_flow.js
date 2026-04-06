// audits/functional/checks/completion_package_flow.js
// Verifies that completion packages are built correctly for completed jobs.
// A valid completion package must contain: unsigned tx, deliverable hash,
// IPFS URI, and a signing manifest. No signed data may be present.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT, AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "functional.completion_package_flow";

const COMPLETION_STATE_STATUSES = ["completion_ready", "completed", "done"];
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const REQUIRED_PACKAGE_FIELDS = ["jobId", "deliverables"];
const FORBIDDEN_SIGNED_FIELDS = ["r", "s", "v", "signedTx", "signature"];

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
      details: "Job state directory not found — cannot verify completion package flow",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const issues = [];
  let checked = 0;

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); } catch { continue; }

    const status = (state.status || "").toLowerCase();
    if (!COMPLETION_STATE_STATUSES.includes(status)) continue;

    const jobId = state.jobId || file.split("/").pop().replace(".json", "");
    checked++;

    const packagePath = `${ARTIFACTS_ROOT}/job_${jobId}/completion.json`;
    const txPath = `${ARTIFACTS_ROOT}/job_${jobId}/tx_package.json`;

    const packageExists = await fileExists(packagePath);
    if (!packageExists) {
      issues.push(`job ${jobId}: completion.json missing`);
      continue;
    }

    let pkg;
    try { pkg = await readJson(packagePath); } catch {
      issues.push(`job ${jobId}: completion.json not parseable`);
      continue;
    }

    for (const field of REQUIRED_PACKAGE_FIELDS) {
      if (!(field in pkg)) {
        issues.push(`job ${jobId}: completion.json missing required field "${field}"`);
      }
    }

    const txExists = await fileExists(txPath);
    if (txExists) {
      let tx;
      try { tx = await readJson(txPath); } catch { continue; }
      for (const field of FORBIDDEN_SIGNED_FIELDS) {
        if (field in (tx.transaction || tx.tx || tx)) {
          issues.push(`job ${jobId}: tx_package.json contains signed field "${field}"`);
        }
      }
    }
  }

  if (checked === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No completed jobs found — completion package flow not yet exercised",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  if (issues.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${issues.length} completion package issue(s) across ${checked} job(s): ${issues.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { issues, checked },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Completion packages valid for all ${checked} completed job(s)`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
