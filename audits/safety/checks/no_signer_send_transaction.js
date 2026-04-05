// audits/safety/checks/no_signer_send_transaction.js
// Ensures signer.sendTransaction / wallet.sendTransaction are never called.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "safety.no_signer_send_transaction";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules") && !f.includes("audits/");
 
const PATTERNS = [
  "signer.sendTransaction",
  "wallet.sendTransaction",
  "provider.sendTransaction",
  ".sendTransaction(",
  "eth_sendTransaction",
];
 
export async function run(ctx) {
  const start = Date.now();
  const hits = [];
 
  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of PATTERNS) {
      let matches;
      try {
        matches = await searchInFiles(dir, pattern, JS_FILTER);
      } catch {
        continue;
      }
      for (const m of matches) {
        hits.push({ pattern, file: m.file, line: m.line });
      }
    }
  }
 
  if (hits.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${hits.length} sendTransaction call(s) found in source: ${hits.slice(0, 3).map(h => `${h.pattern} @ ${h.file}:${h.line}`).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { hits },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No signer/wallet sendTransaction calls detected",
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}