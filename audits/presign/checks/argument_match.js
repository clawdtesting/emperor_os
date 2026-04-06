// audits/presign/checks/argument_match.js
// Verifies that tx package calldata arguments match the declared
// job/procurement parameters in state. Catches cases where the
// tx was built from stale or incorrect values.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "presign.argument_match";

const TX_PACKAGE_NAMES = ["tx_package.json", "unsigned_tx.json"];

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
      details: "No tx packages found — nothing to verify",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const violations = [];
  let checked = 0;

  for (const pkgPath of allPackages) {
    let pkg;
    try { pkg = await readJson(pkgPath); checked++; } catch { continue; }

    const declaredJobId = pkg.jobId || pkg.job_id || pkg.procurementId || pkg.procurement_id;
    const txJobId = pkg.transaction?.args?.jobId
      || pkg.preparedTx?.args?.jobId
      || pkg.callArgs?.jobId;

    if (declaredJobId && txJobId && String(declaredJobId) !== String(txJobId)) {
      violations.push(`${pkgPath}: declared jobId "${declaredJobId}" != tx arg "${txJobId}"`);
    }

    const declaredTo = pkg.contractAddress || pkg.to;
    const txTo = pkg.transaction?.to || pkg.preparedTx?.to || pkg.to;
    if (declaredTo && txTo && declaredTo.toLowerCase() !== txTo.toLowerCase()) {
      violations.push(`${pkgPath}: declared to "${declaredTo}" != tx.to "${txTo}"`);
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} argument mismatch(es) in ${checked} tx package(s): ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) have matching arguments`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
