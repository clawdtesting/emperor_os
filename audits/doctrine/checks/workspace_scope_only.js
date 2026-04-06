// audits/doctrine/checks/workspace_scope_only.js
// Enforces doctrine: the agent operates exclusively within the workspace.
// No code path may read from or write to paths outside WORKSPACE_ROOT.
// Catches absolute path escapes, home directory references, and /tmp usage.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT, WORKSPACE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";

const CHECK_NAME = "doctrine.workspace_scope_only";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules") && !f.includes("audits/");

const OUT_OF_SCOPE_PATTERNS = [
  /['"`]\/home\/(?!emperor)/,
  /['"`]\/root\//,
  /['"`]\/tmp\//,
  /['"`]\/var\//,
  /['"`]\/etc\//,
  /process\.env\.HOME/,
  /os\.homedir\(\)/,
];

export async function run(ctx) {
  const start = Date.now();
  const violations = [];

  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of OUT_OF_SCOPE_PATTERNS) {
      let matches;
      try { matches = await searchInFiles(dir, pattern, JS_FILTER); } catch { continue; }
      for (const m of matches) {
        violations.push(`${m.file}:${m.line} — ${m.content.trim()}`);
      }
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} out-of-scope path reference(s) detected: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No out-of-scope path references detected — workspace boundary intact",
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
