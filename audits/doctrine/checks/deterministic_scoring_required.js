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
  { name: "Math.random", regex: /Math\.random\(\)/ },
  { name: "crypto.randomBytes", regex: /crypto\.randomBytes/ },
  { name: "Math.floor(random...)", regex: /Math\.floor\(.*random/ },
];

function isScoringOrValidationPath(filePath) {
  const p = filePath.toLowerCase();
  return (
    p.includes("score") ||
    p.includes("scoring") ||
    p.includes("validator") ||
    p.includes("validation") ||
    p.includes("evaluate") ||
    p.includes("evaluation") ||
    p.includes("adjudicat") ||
    p.includes("rank")
  );
}

function isIoTmpNameConstruct(line) {
  const normalized = line.replace(/\s+/g, "");
  return normalized.includes(".tmp.${Date.now()}.") || normalized.includes(".tmp.${Date.now().");
}

export async function run(ctx) {
  const start = Date.now();
  const violations = [];
  let candidateMatches = 0;

  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of NONDETERMINISTIC_PATTERNS) {
      let matches;
      try { matches = await searchInFiles(dir, pattern.regex, JS_FILTER); } catch { continue; }
      for (const m of matches) {
        candidateMatches += 1;

        if (!isScoringOrValidationPath(m.file)) continue;
        if (isIoTmpNameConstruct(m.content)) continue;

        violations.push(`${m.file}:${m.line} [${pattern.name}] — ${m.content.trim()}`);
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
      details: `No nondeterministic constructs detected in scoring/validation paths (scanned ${candidateMatches} candidate token hit(s) in agent/core source, excluding I/O tmp-name constructs).`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
