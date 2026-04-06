// audits/functional/checks/artifact_flow.js
// Verifies that the artifact production pipeline works end-to-end.
// Checks that: a job in completion state has an artifact directory,
// the artifact directory contains the expected files, and that
// artifact content is non-empty and parseable.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT, AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, readText, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "functional.artifact_flow";
const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;

const TERMINAL_STATUSES = ["completed", "done", "completion_ready"];
const EXPECTED_ARTIFACT_FILES = ["manifest.json", "completion.json"];

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
      details: "Job state directory not found — cannot verify artifact flow",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const failures = [];
  let checked = 0;

  for (const file of jobFiles) {
    let state;
    try { state = await readJson(file); } catch { continue; }

    const status = (state.status || "").toLowerCase();
    if (!TERMINAL_STATUSES.includes(status)) continue;

    const jobId = state.jobId || file.split("/").pop().replace(".json", "");
    checked++;

    const artifactDir = `${ARTIFACTS_ROOT}/job_${jobId}`;
    const dirExists = await fileExists(artifactDir);

    if (!dirExists) {
      failures.push(`job ${jobId}: artifact directory missing at ${artifactDir}`);
      continue;
    }

    for (const expectedFile of EXPECTED_ARTIFACT_FILES) {
      const filePath = `${artifactDir}/${expectedFile}`;
      const exists = await fileExists(filePath);
      if (!exists) {
        failures.push(`job ${jobId}: missing ${expectedFile}`);
        continue;
      }

      try {
        const content = await readText(filePath);
        if (!content || content.trim().length < 10) {
          failures.push(`job ${jobId}: ${expectedFile} is empty or too short`);
        }
        if (expectedFile.endsWith(".json")) {
          JSON.parse(content);
        }
      } catch {
        failures.push(`job ${jobId}: ${expectedFile} is not valid JSON`);
      }
    }
  }

  if (checked === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No completed jobs found — artifact flow not yet exercised",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  if (failures.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${failures.length} artifact flow failure(s) across ${checked} completed job(s): ${failures.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { failures, checked },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Artifact flow verified for all ${checked} completed job(s)`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
