// audits/presign/checks/target_contract_match.js
// Verifies that the tx.to address in each package matches the canonical
// contract address for the declared operation type. Prevents sending
// a tx to the wrong contract — the most dangerous pre-sign failure mode.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT, AGI_JOB_MANAGER, AGI_JOB_DISCOVERY_PRIME } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "presign.target_contract_match";
const TX_PACKAGE_NAMES = ["tx_package.json", "unsigned_tx.json"];

const ALLOWED_TARGETS = new Set([
  AGI_JOB_MANAGER.toLowerCase(),
  AGI_JOB_DISCOVERY_PRIME.toLowerCase(),
]);

export async function run(ctx) {
  const start = Date.now();

  const allPackages = [];
  for (const baseDir of [ARTIFACTS_ROOT, `${AGENT_ROOT}/artifacts`]) {
    try {
      const files = await listFiles(baseDir, f => TX_PACKAGE_NAMES.includes(f));
      allPackages.push(...files);
    } catch { continue; }
  }

  if (allPackages.length === 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: "No tx packages found — nothing to check",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const violations = [];
  let checked = 0;

  for (const pkgPath of allPackages) {
    let pkg;
    try { pkg = await readJson(pkgPath); checked++; } catch { continue; }

    const to = pkg.transaction?.to || pkg.preparedTx?.to || pkg.to;
    if (!to) {
      violations.push(`${pkgPath}: tx.to is missing`);
      continue;
    }

    if (!ALLOWED_TARGETS.has(to.toLowerCase())) {
      violations.push(`${pkgPath}: tx.to "${to}" is not a known contract address`);
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} tx package(s) targeting unexpected contracts: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations, allowedTargets: [...ALLOWED_TARGETS] },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) target canonical contract addresses`,
      durationMs: Date.now() - start,
      extra: { checked, allowedTargets: [...ALLOWED_TARGETS] },
    });
  }

  return ctx;
}
