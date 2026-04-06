// audits/static/checks/workspace_boundary.js
// Verifies code and paths stay within the permitted workspace doctrine.
// Detects likely path escapes while suppressing known-safe false positives
// (imports, comments, and canonical workspace absolute prefixes).

import path from "path";
import { searchInFiles } from "../../lib/fs_utils.js";
import { AGENT_ROOT, CORE_ROOT, WORKSPACE_ROOT } from "../../lib/constants.js";

const JS_FILTER = (name, fullPath) =>
  (name.endsWith(".js") || name.endsWith(".ts")) && !fullPath.includes("node_modules");

const WORKSPACE_PREFIX = WORKSPACE_ROOT.replace(/\\/g, "/").replace(/\/$/, "");
const ALLOWED_ABSOLUTE_PREFIXES = new Set([
  WORKSPACE_PREFIX,
  "/home/emperor/.openclaw/workspace",
  "/home/ubuntu/emperor_OS/.openclaw/workspace",
]);

const ESCAPE_RULES = [
  {
    id: "path_traversal",
    // Focus on explicit traversal segments used in path construction; allow import re-exports.
    pattern: /['"`]\.\.\/\.\.\//,
    allow: line => /^\s*(import|export)\b/.test(line),
  },
  {
    id: "forbidden_absolute",
    // Absolute paths outside workspace roots are forbidden in runtime code.
    pattern: /['"`](\/(?:home|root|tmp|var|etc)\/[^'"`]*)['"`]/,
    allow: line => {
      const m = line.match(/['"`](\/(?:home|root|tmp|var|etc)\/[^'"`]*)['"`]/);
      if (!m) return false;
      const candidate = m[1];
      for (const prefix of ALLOWED_ABSOLUTE_PREFIXES) {
        if (candidate === prefix || candidate.startsWith(`${prefix}/`)) {
          return true;
        }
      }
      return false;
    },
  },
  {
    id: "homedir_usage",
    pattern: /(process\.env\.HOME|os\.homedir\(\))/,
    allow: () => false,
  },
];

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
}

function rel(file) {
  return path.relative(WORKSPACE_ROOT, file).replace(/\\/g, "/");
}

export async function run(ctx) {
  const start = Date.now();
  const violations = [];

  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const rule of ESCAPE_RULES) {
      const matches = await searchInFiles(dir, rule.pattern, JS_FILTER);
      for (const match of matches) {
        const line = match.content || "";
        if (isCommentLine(line)) continue;
        if (rule.allow(line, match)) continue;
        violations.push({
          rule: rule.id,
          file: rel(match.file),
          line: match.line,
          content: line,
        });
      }
    }
  }

  const sample = violations
    .slice(0, 6)
    .map(v => `${v.file}:${v.line} [${v.rule}] ${v.content}`)
    .join("; ");

  return [{
    name: "workspace_boundary",
    status: violations.length === 0 ? "pass" : "critical",
    details: violations.length === 0
      ? "No workspace boundary violations detected"
      : `Found ${violations.length} path escape candidate(s) in agent/core code${sample ? `: ${sample}` : ""}`,
    durationMs: Date.now() - start,
    extra: violations.length ? { violations } : undefined,
  }];
}
