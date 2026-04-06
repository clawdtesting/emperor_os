// audits/doctrine/checks/unsigned_handoff_only.js
// Enforces doctrine: every on-chain action is packaged as an unsigned
// JSON envelope and handed to the operator. No signed tx data may exist
// in any tx package artifact. The signing boundary is absolute.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { ARTIFACTS_ROOT, AGENT_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "doctrine.unsigned_handoff_only";

const TX_PACKAGE_NAMES = [
  "tx_package.json",
  "unsigned_tx.json",
  "transaction_package.json",
  "tx.json",
];

const SIGNED_INDICATORS = ["r", "s", "v"];

function hasSignedFields(tx) {
  if (!tx || typeof tx !== "object") return false;
  const hasRSV = SIGNED_INDICATORS.every(f => f in tx);
  if (hasRSV) return true;
  if (typeof tx.raw === "string" && tx.raw.startsWith("0x") && tx.raw.length > 100) return true;
  if (typeof tx.signedTx === "string") return true;
  return false;
}

export async function run(ctx) {
  const start = Date.now();
  const violations = [];
  let checked = 0;

  for (const baseDir of [ARTIFACTS_ROOT, `${AGENT_ROOT}/artifacts`]) {
    let files;
    try {
      files = await listFiles(baseDir, f => TX_PACKAGE_NAMES.includes(f));
    } catch { continue; }

    for (const filePath of files) {
      let data;
      try { data = await readJson(filePath); checked++; } catch { continue; }

      const tx = data.transaction || data.tx || data.preparedTx || data;
      if (hasSignedFields(tx)) {
        violations.push(`${filePath}: contains signed tx fields`);
      }
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} tx package(s) contain signed data — signing boundary violated: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations, checked },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) are unsigned — handoff boundary intact`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
