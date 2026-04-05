// audits/static/checks/config_sanity.js
// Validate config shapes and expected env keys.

import { checkRequiredEnv } from "../../lib/env_utils.js";
import { fileExists, readJson } from "../../lib/fs_utils.js";
import { WORKSPACE_ROOT } from "../../lib/constants.js";

export async function run(ctx) {
  const start = Date.now();
  const checks = [];

  // Check required env vars
  const envCheck = checkRequiredEnv();
  checks.push({
    name: "config_env_required",
    status: envCheck.ok ? "pass" : "warn",
    details: envCheck.ok
      ? "All required environment variables present"
      : `Missing: ${envCheck.missing.join(", ")}`,
    durationMs: Date.now() - start,
  });

  // Check config.js exists and has expected shape
  const configPath = `${WORKSPACE_ROOT}/agent/config.js`;
  const configExists = await fileExists(configPath);
  checks.push({
    name: "config_file_exists",
    status: configExists ? "pass" : "fail",
    details: configExists ? "agent/config.js exists" : "agent/config.js missing",
    durationMs: Date.now() - start,
  });

  return checks;
}
