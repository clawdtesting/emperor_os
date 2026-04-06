// audits/presign/checks/freshness_window.js
// Verifies that tx packages were built recently enough to be valid.
// A stale tx package may reference expired deadlines or outdated state.
// Packages older than MAX_FRESHNESS_MS must be rebuilt before signing.

import { addCheck } from "../../lib/audit_context.js";
import { SEVERITY } from "../../lib/severity.js";
import { AGENT_ROOT, ARTIFACTS_ROOT, MAX_FRESHNESS_MS } from "../../lib/constants.js";
import { listFiles, readJson } from "../../lib/fs_utils.js";
import { promises as fs } from "fs";

const CHECK_NAME = "presign.freshness_window";
const TX_PACKAGE_NAMES = ["tx_package.json", "unsigned_tx.json"];

export async function run(ctx) {
  const start = Date.now();
  const now = Date.now();

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

  const stale = [];
  let checked = 0;

  for (const pkgPath of allPackages) {
    let pkg;
    try { pkg = await readJson(pkgPath); checked++; } catch { continue; }

    const builtAt = pkg.builtAt || pkg.createdAt || pkg.generatedAt;
    let ageMs;

    if (builtAt) {
      ageMs = now - Date.parse(builtAt);
    } else {
      try {
        const stat = await fs.stat(pkgPath);
        ageMs = now - stat.mtimeMs;
      } catch { continue; }
    }

    if (ageMs > MAX_FRESHNESS_MS) {
      stale.push({
        file: pkgPath,
        ageMin: Math.round(ageMs / 60000),
        maxAgeMin: Math.round(MAX_FRESHNESS_MS / 60000),
      });
    }
  }

  if (stale.length > 0) {
    const details = stale.slice(0, 3).map(s => `${s.file} (${s.ageMin}min old, max ${s.maxAgeMin}min)`).join("; ");
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.CRITICAL,
      severity: SEVERITY.CRITICAL,
      details: `${stale.length} stale tx package(s) must be rebuilt: ${details}`,
      durationMs: Date.now() - start,
      extra: { stale, maxFreshnessMs: MAX_FRESHNESS_MS },
    });
  } else {
    addCheck(ctx, {
      name: CHECK_NAME,
      status: SEVERITY.PASS,
      severity: SEVERITY.PASS,
      details: `All ${checked} tx package(s) within freshness window (max ${Math.round(MAX_FRESHNESS_MS / 60000)}min)`,
      durationMs: Date.now() - start,
    });
  }

  return ctx;
}
