// audits/presign/checks/chainid_mainnet_only.js
// Ensures every tx package targets mainnet (chainId 1) only.
// A tx built for the wrong chain is worthless and potentially dangerous
// if submitted. This is a hard gate — wrong chainId is always CRITICAL.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT, MAINNET_CHAIN_ID } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "presign.chainid_mainnet_only";
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

    const chainId = pkg.chainId
      ?? pkg.transaction?.chainId
      ?? pkg.preparedTx?.chainId
      ?? pkg.network?.chainId;

    if (chainId === undefined || chainId === null) {
      violations.push(`${pkgPath}: chainId not declared`);
      continue;
    }

    if (Number(chainId) !== MAINNET_CHAIN_ID) {
      violations.push(`${pkgPath}: chainId ${chainId} (expected ${MAINNET_CHAIN_ID})`);
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} tx package(s) with wrong or missing chainId: ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations, checked },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) target mainnet (chainId ${MAINNET_CHAIN_ID})`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
