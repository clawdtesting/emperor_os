// agent/pre-sign-checks.js
// Pre-signing validation: freshness, selector, simulation stub, and SHA-256 hashing.

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

/**
 * Compute SHA-256 of a JSON file's contents.
 */
export async function sha256FromJsonFile(filePath) {
  const data = await fs.readFile(filePath, "utf8");
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Run pre-sign checks on an unsigned tx package before operator signing.
 *
 * Validates freshness (generatedAt / expiresAt), selector presence, and
 * optionally writes a pre-sign check report to disk.
 */
export async function runPreSignChecks({
  unsignedPackage,
  reviewContext = {},
  fromAddress,
  simulationReportPath,
  preSignCheckPath,
  expectedJobCompletionUri,
  expectedJobCompletionSha256,
}) {
  const checks = [];

  // 1. Freshness — generatedAt
  const generatedAt =
    unsignedPackage?.generatedAt ?? unsignedPackage?.extra?.generatedAt;
  const expiresAt = unsignedPackage?.extra?.expiresAt ?? unsignedPackage?.expiresAt;
  const now = Date.now();

  if (generatedAt) {
    const ageMs = now - new Date(generatedAt).getTime();
    const maxAgeMs = 30 * 60 * 1000; // 30 minutes
    checks.push({
      check: "freshness:generatedAt",
      pass: ageMs <= maxAgeMs,
      detail: `age ${Math.round(ageMs / 1000)}s (max ${maxAgeMs / 1000}s)`,
    });
  }

  // 2. Freshness — expiresAt
  if (expiresAt) {
    const expired = now > new Date(expiresAt).getTime();
    checks.push({
      check: "freshness:expiresAt",
      pass: !expired,
      detail: expired ? `expired at ${expiresAt}` : `valid until ${expiresAt}`,
    });
  }

  // 3. Tx data / selector present
  const txData =
    unsignedPackage?.tx?.data ??
    unsignedPackage?.preparedTx?.data ??
    unsignedPackage?.calldata;
  checks.push({
    check: "tx:data-present",
    pass: Boolean(txData),
    detail: txData ? `${String(txData).slice(0, 10)}...` : "missing",
  });

  // 4. From-address match
  if (fromAddress && unsignedPackage?.tx?.from) {
    const match =
      String(unsignedPackage.tx.from).toLowerCase() ===
      String(fromAddress).toLowerCase();
    checks.push({
      check: "from-address-match",
      pass: match,
      detail: match
        ? "ok"
        : `expected ${fromAddress}, got ${unsignedPackage.tx.from}`,
    });
  }

  // 5. Completion URI integrity
  if (expectedJobCompletionUri) {
    const actual = unsignedPackage?.extra?.jobCompletionURI;
    const match = actual === expectedJobCompletionUri;
    checks.push({
      check: "completion-uri-match",
      pass: match,
      detail: match ? "ok" : "mismatch",
    });
  }

  const report = {
    schema: "emperor-os/pre-sign-check/v1",
    generatedAt: new Date().toISOString(),
    reviewContext,
    checks,
    allPassed: checks.every((c) => c.pass),
  };

  // Write report to disk
  if (preSignCheckPath) {
    await fs.mkdir(path.dirname(preSignCheckPath), { recursive: true });
    await fs.writeFile(preSignCheckPath, JSON.stringify(report, null, 2));
  }

  if (simulationReportPath) {
    await fs.mkdir(path.dirname(simulationReportPath), { recursive: true });
    await fs.writeFile(
      simulationReportPath,
      JSON.stringify(
        {
          schema: "emperor-os/simulation-report/v1",
          generatedAt: new Date().toISOString(),
          note: "Simulation stub — full tenderly/anvil simulation not yet wired.",
        },
        null,
        2
      )
    );
  }

  if (!report.allPassed) {
    const failed = checks
      .filter((c) => !c.pass)
      .map((c) => `${c.check}: ${c.detail}`);
    throw new Error(`Pre-sign checks failed: ${failed.join("; ")}`);
  }

  return report;
}
