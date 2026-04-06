// audits/integration/checks/file_system_permissions.js
// Verifies that critical workspace directories are readable and writable.
// Checks state dirs, artifact dirs, and log dirs. A permissions failure
// here means the agent cannot persist state and will lose work silently.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { WORKSPACE_ROOT, AGENT_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { promises as fs } from "fs";
import { join } from "path";

const CHECK_NAME = "integration.file_system_permissions";

const CRITICAL_DIRS = [
  { path: WORKSPACE_ROOT, label: "workspace root", write: false },
  { path: AGENT_ROOT, label: "agent root", write: false },
  { path: join(AGENT_ROOT, "state"), label: "agent state", write: true },
  { path: join(AGENT_ROOT, "state", "jobs"), label: "job state", write: true },
  { path: join(AGENT_ROOT, "artifacts"), label: "agent artifacts", write: true },
  { path: ARTIFACTS_ROOT, label: "artifacts root", write: true },
];

async function checkDir(dir, requireWrite) {
  let stats = null;
  try {
    stats = await fs.stat(dir);
  } catch {
    if (!requireWrite) return { readable: false, writable: false, missing: true };
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
      return { readable: true, writable: true, created: true };
    } catch {
      return { readable: false, writable: false, missing: true };
    }
  }

  if (!stats?.isDirectory?.()) return { readable: false, writable: false, notDirectory: true };

  try {
    await fs.access(dir, fs.constants.R_OK);
  } catch {
    return { readable: false, writable: false };
  }

  if (!requireWrite) return { readable: true, writable: null };

  try {
    await fs.access(dir, fs.constants.W_OK);
    return { readable: true, writable: true };
  } catch {
    return { readable: true, writable: false };
  }
}

export async function run(ctx) {
  const start = Date.now();
  const issues = [];
  const notes = [];

  for (const { path, label, write } of CRITICAL_DIRS) {
    const result = await checkDir(path, write);

    if (!result.readable) {
      issues.push(`${label} (${path}): not readable`);
    } else if (result.created) {
      notes.push(`${label} (${path}): created during audit bootstrap`);
    } else if (write && result.writable === false) {
      issues.push(`${label} (${path}): not writable`);
    }
  }

  if (issues.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${issues.length} filesystem permission issue(s): ${issues.join("; ")}`,
      durationMs: Date.now() - start,
      extra: { issues, notes },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: notes.length > 0
        ? `All ${CRITICAL_DIRS.length} critical directories are accessible (${notes.length} created during audit bootstrap)`
        : `All ${CRITICAL_DIRS.length} critical directories are accessible`,
      durationMs: Date.now() - start,
      extra: notes.length > 0 ? { notes } : undefined,
    });
  }

  return ctx;
}
