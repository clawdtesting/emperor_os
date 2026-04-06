// audits/integration/checks/github_sync_health.js
// Verifies the workspace git repository is healthy and in sync.
// Checks: git repo exists, no uncommitted critical state files,
// remote is reachable, and branch is not far behind origin.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { WORKSPACE_ROOT } from "../../lib/constants.js";
import { fileExists } from "../../lib/fs_utils.js";
import { exec } from "child_process";
import { promisify } from "util";

const CHECK_NAME = "integration.github_sync_health";
const execAsync = promisify(exec);

const MAX_COMMITS_BEHIND = 10;

async function git(args) {
  const { stdout } = await execAsync(`git -C "${WORKSPACE_ROOT}" ${args}`);
  return stdout.trim();
}

export async function run(ctx) {
  const start = Date.now();

  const gitDir = `${WORKSPACE_ROOT}/.git`;
  const isRepo = await fileExists(gitDir);
  if (!isRepo) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Workspace is not a git repository",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const issues = [];

  try {
    const status = await git("status --porcelain");
    const dirtyFiles = status.split("\n").filter(Boolean);
    const criticalDirty = dirtyFiles.filter(f =>
      f.includes("agent/state/") || f.includes("agent/artifacts/")
    );
    if (criticalDirty.length > 0) {
      issues.push(`${criticalDirty.length} critical state file(s) uncommitted: ${criticalDirty.slice(0, 2).join(", ")}`);
    }
  } catch {
    issues.push("could not read git status");
  }

  try {
    await git("fetch --dry-run origin 2>&1");
  } catch {
    issues.push("git remote unreachable");
  }

  try {
    const behind = await git("rev-list --count HEAD..origin/main 2>/dev/null || echo 0");
    const behindCount = parseInt(behind, 10);
    if (behindCount > MAX_COMMITS_BEHIND) {
      issues.push(`branch is ${behindCount} commits behind origin/main`);
    }
  } catch {
    // non-critical — skip
  }

  if (issues.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: `GitHub sync issues: ${issues.join("; ")}`,
      durationMs: Date.now() - start,
      extra: { issues },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "Git repository is healthy and in sync",
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
