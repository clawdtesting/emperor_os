// audits/static/checks/doctrine_enforcement.js
// Search for forbidden doctrine violations statically.
// Checks: unsigned handoff only, no private key usage, no signing in worker paths.

import { searchInFiles } from "../../lib/fs_utils.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { checkDoctrineViolation } from "../../lib/doctrine_rules.js";

export async function run(ctx) {
  const start = Date.now();
  const checks = [];
  const dirsToScan = [AGENT_ROOT, CORE_ROOT];

  // Check unsigned_handoff_only doctrine
  const unsignedChecks = [];
  for (const dir of dirsToScan) {
    // Look for any file that might contain signing logic
    const signingMatches = await searchInFiles(dir, /signTransaction|sendTransaction|privateKey/, (name) => name.endsWith(".js"));
    const realMatches = signingMatches.filter(m => {
      const line = m.content.trim();
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return false;
      if (m.file.includes("/test/") || m.file.includes(".test.")) return false;
      return true;
    });
    unsignedChecks.push(...realMatches);
  }

  checks.push({
    name: "unsigned_handoff_only",
    status: unsignedChecks.length === 0 ? "pass" : "critical",
    details: unsignedChecks.length === 0
      ? "No signing logic found in worker code — unsigned handoff doctrine upheld"
      : `Found ${unsignedChecks.length} potential signing reference(s) violating unsigned-only doctrine`,
    durationMs: Date.now() - start,
  });

  // Check no_private_key_usage
  const pkMatches = [];
  const KNOWN_FALSE_POSITIVES = [
    { file: "prime-evaluate.js", pattern: "AGENT_PRIVATE_KEY", reason: "spec rejection rule, not key usage" },
    { file: "prime-evaluate.js", pattern: "PRIVATE_KEY", reason: "spec rejection rule, not key usage" },
    // Also exclude the pattern definitions themselves in hard reject rules
    { file: "prime-evaluate.js", pattern: "{ pattern: /AGENT_PRIVATE_KEY\\b/", reason: "hard reject rule pattern" },
    { file: "prime-evaluate.js", pattern: "/AGENT_PRIVATE_KEY\\b/", reason: "hard reject rule regex" },
  ];
  function isFalsePositive(hit) {
    return KNOWN_FALSE_POSITIVES.some(fp =>
      hit.file.endsWith(fp.file) && hit.content.includes(fp.pattern)
    );
  }
  for (const dir of dirsToScan) {
    const matches = await searchInFiles(dir, /privateKey|PRIVATE_KEY|0x.*private/, (name) => name.endsWith(".js"));
    const realMatches = matches.filter(m => {
      if (!m || typeof m.file !== "string" || typeof m.content !== "string") return false;
      const line = m.content.trim();
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return false;
      if (m.file.includes("/test/") || m.file.includes(".test.")) return false;
      if (m.file.includes("config.js") || m.file.includes(".env")) return false;
      const hit = { pattern: m.pattern || "privateKey", file: m.file, line: m.line, content: line };
      return !isFalsePositive(hit);
    });
    pkMatches.push(...realMatches);
  }

  checks.push({
    name: "no_private_key_usage",
    status: pkMatches.length === 0 ? "pass" : "critical",
    details: pkMatches.length === 0
      ? "No private key references found in worker code"
      : `Found ${pkMatches.length} potential private key reference(s)`,
    durationMs: Date.now() - start,
  });

  return checks;
}
