// audits/static/checks/workspace_boundary.js
// Verifies code and paths stay within the permitted workspace doctrine.
// Detects writes outside allowed workspace, hardcoded forbidden paths, unsafe path joins.

import { searchInFiles } from "../../lib/fs_utils.js";
import { AGENT_ROOT, CORE_ROOT, WORKSPACE_ROOT } from "../../lib/constants.js";

export async function run(ctx) {
  const start = Date.now();
  const checks = [];

  // Check for path traversal patterns that escape workspace
  const escapePatterns = [
    /\.\.\/\.\.\/\.\.\/\.\.\//,
    /process\.cwd\(\)/,
    /\/etc\//,
    /\/tmp\//,
    /\/home\/(?!ubuntu\/\.openclaw\/workspace)/,
  ];

  const dirsToScan = [AGENT_ROOT, CORE_ROOT];
  let escapeFound = 0;

  for (const dir of dirsToScan) {
    for (const pattern of escapePatterns) {
      const matches = await searchInFiles(dir, pattern, (name) => name.endsWith(".js"));
      escapeFound += matches.length;
    }
  }

  checks.push({
    name: "workspace_boundary",
    status: escapeFound === 0 ? "pass" : "critical",
    details: escapeFound === 0
      ? "No workspace boundary violations detected"
      : `Found ${escapeFound} potential path escape patterns in agent/core code`,
    durationMs: Date.now() - start,
  });

  return checks;
}
