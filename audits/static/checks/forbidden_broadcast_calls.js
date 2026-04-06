// audits/static/checks/forbidden_broadcast_calls.js
// Detect any direct broadcast capability in worker code.
// Detects: provider.broadcastTransaction, eth_sendRawTransaction, sendTransaction(, wrapper abstractions around broadcast.

import { searchInFiles } from "../../lib/fs_utils.js";
import { AGENT_ROOT, CORE_ROOT, FORBIDDEN_BROADCAST_PATTERNS } from "../../lib/constants.js";

export async function run(ctx) {
  const start = Date.now();
  const checks = [];
  const dirsToScan = [AGENT_ROOT, CORE_ROOT];
  const allMatches = [];

  for (const dir of dirsToScan) {
    for (const pattern of FORBIDDEN_BROADCAST_PATTERNS) {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const matches = await searchInFiles(dir, regex, (name, fullPath) => name.endsWith(".js") && !fullPath.includes("node_modules"));
      for (const m of matches) {
        allMatches.push({ ...m, pattern });
      }
    }
  }

  const realMatches = allMatches.filter(m => {
    const line = m.content.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return false;
    if (m.file.includes("/test/") || m.file.includes(".test.")) return false;
    return true;
  });

  checks.push({
    name: "forbidden_broadcast_calls",
    status: realMatches.length === 0 ? "pass" : "critical",
    details: realMatches.length === 0
      ? "No forbidden broadcast patterns found in worker code"
      : `Found ${realMatches.length} forbidden broadcast pattern(s):\n${realMatches.map(m => `  ${m.file}:${m.line} — "${m.pattern}" in "${m.content}"`).join("\n")}`,
    durationMs: Date.now() - start,
  });

  return checks;
}
