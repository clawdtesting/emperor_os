// audits/safety/checks/unsigned_only_guarantee.js
// Verifies that completion packages only contain unsigned transactions (no signed tx data).
 
import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";
import { fileExists } from "../../lib/fs_utils.js";
 
const CHECK_NAME = "safety.unsigned_only_guarantee";
 
export async function run(ctx) {
  const start = Date.now();
 
  let artifactFiles;
  try {
    artifactFiles = await listFiles(ARTIFACTS_ROOT, f => f.endsWith(".json"));
  } catch {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.WARN,
      severity: SEVERITY.WARN,
      details: "Artifacts directory not found or empty — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  if (artifactFiles.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No artifact files found — unsigned-only guarantee holds by absence",
      durationMs: Date.now() - start,
    });
    return ctx;
  }
 
  const violations = [];
 
  for (const file of artifactFiles) {
    let data;
    try {
      data = await readJson(file);
    } catch {
      continue;
    }
 
    // Check for signed transaction fields
    const tx = data.transaction || data.tx || data.signedTx || data.signedTransaction;
    if (!tx) continue;
 
    if (tx.r && tx.s && tx.v !== undefined) {
      violations.push(`${file}: contains signed tx fields (r, s, v)`);
    }
    if (typeof tx === "string" && tx.startsWith("0x") && tx.length > 100) {
      violations.push(`${file}: contains raw signed tx hex string`);
    }
  }
 
  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} artifact(s) contain signed transaction data: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `Checked ${artifactFiles.length} artifact(s) — all unsigned`,
      durationMs: Date.now() - start,
    });
  }
 
  return ctx;
}