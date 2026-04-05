// audits/static/checks/forbidden_signing_calls.js
// Search for usage patterns that imply signing in worker code.
// Detects: wallet.signTransaction, signer.sendTransaction, signTypedData, direct raw tx signing helpers.

import { searchInFiles } from "../../lib/fs_utils.js";
import { AGENT_ROOT, CORE_ROOT, FORBIDDEN_SIGNING_PATTERNS } from "../../lib/constants.js";

export async function run(ctx) {
  const start = Date.now();
  const checks = [];
  const dirsToScan = [AGENT_ROOT, CORE_ROOT];
  const allMatches = [];

  for (const dir of dirsToScan) {
    for (const pattern of FORBIDDEN_SIGNING_PATTERNS) {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const matches = await searchInFiles(dir, regex, (name) => name.endsWith(".js"));
      for (const m of matches) {
        allMatches.push({ ...m, pattern });
      }
    }
  }

  // Filter out comments and test files
  const realMatches = allMatches.filter(m => {
    const line = m.content.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return false;
    if (m.file.includes("/test/") || m.file.includes(".test.")) return false;
    return true;
  });

  checks.push({
    name: "forbidden_signing_calls",
    status: realMatches.length === 0 ? "pass" : "critical",
    details: realMatches.length === 0
      ? "No forbidden signing patterns found in worker code"
      : `Found ${realMatches.length} forbidden signing pattern(s):\n${realMatches.map(m => `  ${m.file}:${m.line} — "${m.pattern}" in "${m.content}"`).join("\n")}`,
    durationMs: Date.now() - start,
  });

  return checks;
}
