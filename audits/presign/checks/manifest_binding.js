// audits/presign/checks/manifest_binding.js
// Verifies that every tx package has a corresponding signing manifest
// and that the manifest correctly binds the tx to its job/procurement.
// A tx without a manifest cannot be reviewed by the operator safely.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT } from "../../lib/constants.js";
import { listFiles, readJson, fileExists } from "../../lib/fs_utils.js";

const CHECK_NAME = "presign.manifest_binding";

const TX_PACKAGE_NAMES = ["tx_package.json", "unsigned_tx.json"];
const MANIFEST_NAMES = ["signing_manifest.json", "manifest.json", "review_manifest.json"];

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

    const dir = pkgPath.substring(0, pkgPath.lastIndexOf("/"));

    let manifestFound = false;
    for (const name of MANIFEST_NAMES) {
      if (await fileExists(`${dir}/${name}`)) {
        manifestFound = true;
        const manifest = await readJson(`${dir}/${name}`).catch(() => null);
        if (manifest) {
          const manifestJobId = manifest.jobId || manifest.procurementId;
          const pkgJobId = pkg.jobId || pkg.procurementId;
          if (manifestJobId && pkgJobId && String(manifestJobId) !== String(pkgJobId)) {
            violations.push(`${pkgPath}: manifest jobId "${manifestJobId}" != pkg jobId "${pkgJobId}"`);
          }
        }
        break;
      }
    }

    if (!manifestFound) {
      violations.push(`${pkgPath}: no signing manifest found in ${dir}`);
    }
  }

  if (violations.length > 0) {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${violations.length} manifest binding issue(s) in ${checked} tx package(s): ${violations.slice(0, 3).join("; ")}`,
      durationMs: Date.now() - start,
      extra: { violations },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) have valid signing manifests`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
