// audits/static/checks/required_files.js
// Verify critical files exist in the workspace.

import { fileExists } from "../../lib/fs_utils.js";
import { WORKSPACE_ROOT, REQUIRED_DOCTRINE_FILES } from "../../lib/constants.js";

export async function run(ctx) {
  const start = Date.now();
  const checks = [];
  const missing = [];

  for (const file of REQUIRED_DOCTRINE_FILES) {
    const exists = await fileExists(`${WORKSPACE_ROOT}/${file}`);
    if (!exists) missing.push(file);
  }

  // Also check critical runtime files
  const runtimeFiles = [
    "agent/config.js",
    "agent/prime-state.js",
    "agent/prime-monitor.js",
    "agent/prime/prime-orchestrator.js",
    "core/abi-registry.js",
  ];

  for (const file of runtimeFiles) {
    const exists = await fileExists(`${WORKSPACE_ROOT}/${file}`);
    if (!exists) missing.push(file);
  }

  checks.push({
    name: "required_files",
    status: missing.length === 0 ? "pass" : "fail",
    details: missing.length === 0
      ? "All required files present"
      : `Missing ${missing.length} required file(s): ${missing.join(", ")}`,
    durationMs: Date.now() - start,
  });

  return checks;
}
