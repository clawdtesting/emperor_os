// audits/artifact/checks/artifact_presence.js
// Verifies that completed jobs and procurements have all required artifact files.
// A job/procurement that reaches a terminal state without producing its expected
// artifacts is flagged — the deliverable exists but the audit trail is incomplete.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT, WORKSPACE_ROOT, AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists, readText } from "../../lib/fs_utils.js";
import { sha256 } from "../../lib/hash_utils.js";

const CHECK_NAME = "artifact.artifact_presence";

const REQUIRED_ARTIFACTS = [
  "manifest.json",
  "brief.md",
  "spec.json",
  "completion.json",
];

const JOB_STATE_DIR = `${AGENT_ROOT}/state/jobs`;
const PROC_ARTIFACTS_DIR = `${AGENT_ROOT}/artifacts`;

const COMPLETION_STATES = [
  "completed",
  "done",
  "finalized",
  "selected",
  "completion_ready",
];

function normalizePath(base, relative) {
  return relative.startsWith("/") ? relative : `${base}/${relative}`;
}

async function checkJobArtifacts(jobId, state, ctx) {
  const status = (state.status || "").toLowerCase();
  if (!COMPLETION_STATES.includes(status)) return null;

  const artifactDir = `${ARTIFACTS_ROOT}/job_${jobId}`;
  const missing = [];

  for (const artifact of REQUIRED_ARTIFACTS) {
    const path = normalizePath(artifactDir, artifact);
    const exists = await fileExists(path);
    if (!exists) {
      missing.push(artifact);
    }
  }

  if (missing.length > 0) {
    return {
      type: "job",
      id: jobId,
      status: state.status,
      artifactDir,
      missing,
    };
  }

  return {
    type: "job",
    id: jobId,
    status: state.status,
    artifactDir,
    missing: [],
  };
}

async function checkProcurementArtifacts(procId, state, ctx) {
  const status = (state.status || "").toLowerCase();
  if (!COMPLETION_STATES.includes(status)) return null;

  const artifactDir = `${PROC_ARTIFACTS_DIR}/proc_${procId}`;
  const missing = [];

  for (const artifact of REQUIRED_ARTIFACTS) {
    const path = normalizePath(artifactDir, artifact);
    const exists = await fileExists(path);
    if (!exists) {
      missing.push(artifact);
    }
  }

  if (missing.length > 0) {
    return {
      type: "procurement",
      id: procId,
      status: state.status,
      artifactDir,
      missing,
    };
  }

  return {
    type: "procurement",
    id: procId,
    status: state.status,
    artifactDir,
    missing: [],
  };
}

export async function run(ctx) {
  const start = Date.now();
  const results = [];

  try {
    const jobFiles = await listFiles(JOB_STATE_DIR, f => f.endsWith(".json"));
    for (const file of jobFiles) {
      try {
        const state = await readJson(file);
        if (!state) continue;
        const jobId = state.jobId || file.split("/").pop().replace(".json", "");
        const result = await checkJobArtifacts(jobId, state, ctx);
        if (result) results.push(result);
      } catch {
        continue;
      }
    }
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Job state directory not found — skipping job artifact check",
      durationMs: Date.now() - start,
    });
  }

  try {
    const procDirs = await listFiles(PROC_ARTIFACTS_DIR, f => f.startsWith("proc_"));
    for (const dir of procDirs) {
      try {
        const statePath = `${dir}/state.json`;
        const exists = await fileExists(statePath);
        if (!exists) continue;
        const state = await readJson(statePath);
        if (!state) continue;
        const procId = dir.split("/").pop().replace("proc_", "");
        const result = await checkProcurementArtifacts(procId, state, ctx);
        if (result) results.push(result);
      } catch {
        continue;
      }
    }
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Procurement artifacts directory not found — skipping procurement artifact check",
      durationMs: Date.now() - start,
    });
  }

  const incomplete = results.filter(r => r.missing.length > 0);
  const complete = results.filter(r => r.missing.length === 0);

  if (incomplete.length > 0) {
    const details = incomplete.slice(0, 3).map(r =>
      `${r.type} #${r.id} (${r.status}): missing ${r.missing.join(", ")}`
    ).join("; ");

    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${incomplete.length}/${results.length} completed item(s) missing required artifacts: ${details}`,
      durationMs: Date.now() - start,
      extra: {
        total: results.length,
        complete: complete.length,
        incomplete: incomplete.length,
        items: incomplete,
      },
    });
  } else if (results.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${results.length} completed item(s) have required artifacts`,
      durationMs: Date.now() - start,
      extra: {
        total: results.length,
        complete: complete.length,
        incomplete: 0,
      },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No completed jobs or procurements found — nothing to check",
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
