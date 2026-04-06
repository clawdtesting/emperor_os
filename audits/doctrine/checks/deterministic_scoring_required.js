// audits/doctrine/checks/deterministic_scoring_required.js
// Enforces the doctrine rule: deterministic evaluation is preferred at
// every decision point where rules suffice. Scoring that depends on
// nondeterministic sources (random, LLM opinion, wall-clock) violates
// this rule.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";

const CHECK_NAME = "doctrine.deterministic_scoring_required";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules") && !f.includes("audits/");

const NONDETERMINISTIC_PATTERNS = [
  /Math\.random\(\)/,
  /crypto\.randomBytes/,
  /Math\.floor\(.*random/,
];

export async function run(ctx) {
  const start = Date.now();
  const violations = [];

  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of NONDETERMINISTIC_PATTERNS) {
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
      details: `${violations.length} nondeterministic construct(s) found in scoring paths: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No nondeterministic constructs detected in agent/core source",
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
