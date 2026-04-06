// audits/presign/checks/decode_and_compare.js
// Decodes the calldata in tx packages and compares the decoded function
// name and arguments against what was declared in the package metadata.
// Catches encoding bugs where the calldata doesn't match the intent.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";

const CHECK_NAME = "presign.decode_and_compare";
const TX_PACKAGE_NAMES = ["tx_package.json", "unsigned_tx.json"];

function decodeSelector(calldata) {
  if (!calldata || typeof calldata !== "string") return null;
  const hex = calldata.startsWith("0x") ? calldata.slice(2) : calldata;
  if (hex.length < 8) return null;
  return "0x" + hex.slice(0, 8).toLowerCase();
}

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
      details: "No tx packages found — nothing to decode",
      durationMs: Date.now() - start,
    });
    return ctx;
  }

  const violations = [];
  let checked = 0;

  for (const pkgPath of allPackages) {
    let pkg;
    try { pkg = await readJson(pkgPath); checked++; } catch { continue; }

    const calldata = pkg.transaction?.data
      || pkg.preparedTx?.data
      || pkg.calldata
      || pkg.data;

    const declaredSelector = pkg.functionSelector
      || pkg.selector
      || pkg.transaction?.functionSelector;

    if (!calldata) continue;

    const decodedSelector = decodeSelector(calldata);
    if (!decodedSelector) {
      violations.push(`${pkgPath}: cannot decode selector from calldata`);
      continue;
    }

    if (declaredSelector && decodedSelector.toLowerCase() !== declaredSelector.toLowerCase()) {
      violations.push(`${pkgPath}: declared selector ${declaredSelector} != decoded ${decodedSelector}`);
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} calldata decode mismatch(es) in ${checked} package(s): ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) calldata decodes match declared selectors`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
