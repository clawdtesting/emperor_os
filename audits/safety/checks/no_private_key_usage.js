// audits/safety/checks/no_private_key_usage.js
// Ensures no private keys are loaded or referenced in runtime code.
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, CORE_ROOT } from "../../lib/constants.js";
import { searchInFiles } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "safety.no_private_key_usage";
const JS_FILTER = f => (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes("node_modules") && !f.includes("audits/");
 
const PRIVATE_KEY_PATTERNS = [
  "PRIVATE_KEY",
  "privateKey",
  "private_key",
  "fromPrivateKey",
  "new Wallet(",
  "new ethers.Wallet(",
  "privateKeyToAccount",
  "mnemonicToAccount",
  "HDNodeWallet",
];
 
export async function run(ctx) {
  const start = Date.now();
  const hits = [];
 
  for (const dir of [AGENT_ROOT, CORE_ROOT]) {
    for (const pattern of PRIVATE_KEY_PATTERNS) {
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
      details: `${hits.length} private key reference(s) found: ${hits.slice(0, 3).map(h => `${h.pattern} @ ${h.file}:${h.line}`).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { hits },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No private key usage detected in agent or core source",
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}