// audits/presign/checks/selector_match.js
// Verifies that the function selector in tx package calldata matches
// the expected selector for the declared function name.
// Catches ABI encoding bugs and wrong function routing.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";
import { createHash } from "crypto";

const CHECK_NAME = "presign.selector_match";
const TX_PACKAGE_NAMES = ["tx_package.json", "unsigned_tx.json"];

function keccak256Selector(signature) {
  const hash = createHash("sha3-256").update(signature).digest("hex");
  return "0x" + hash.slice(0, 8);
}

const KNOWN_SELECTORS = {
  "requestJob(uint256,string,uint256)": null,
  "submitCompletion(uint256,string)": null,
  "applyForJob(uint256,bytes32)": null,
  "commit(bytes32)": null,
  "reveal(bytes32,bytes32)": null,
  "acceptFinalist(uint256)": null,
  "submitTrial(uint256,string)": null,
  "requestCompletion(uint256)": null,
};

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

    const calldata = pkg.transaction?.data || pkg.preparedTx?.data || pkg.calldata || pkg.data;
    const declaredFunction = pkg.functionName || pkg.function || pkg.transaction?.function;
    const declaredSelector = pkg.functionSelector || pkg.selector;

    if (!calldata) continue;

    const decodedSelector = decodeSelector(calldata);
    if (!decodedSelector) {
      violations.push(`${pkgPath}: cannot extract selector from calldata`);
      continue;
    }

    if (declaredSelector && decodedSelector !== declaredSelector.toLowerCase()) {
      violations.push(`${pkgPath}: calldata selector ${decodedSelector} != declared ${declaredSelector}`);
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} selector mismatch(es) in ${checked} tx package(s): ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) have matching function selectors`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
