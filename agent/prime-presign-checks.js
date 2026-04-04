import path from "path";
import { writeJson, readJson } from "./prime-state.js";
import { simulateUnsignedTx } from "../core/simulation.js";
import { validatePrimeUnsignedTxPackage } from "./prime-tx-validator.js";

const DEFAULT_MAX_PACKAGE_AGE_SECS = Number(process.env.PRIME_MAX_PACKAGE_AGE_SECS ?? "900");

function assertFreshness(unsignedPkg) {
  const now = Date.now();
  const generatedAtMs = Date.parse(String(unsignedPkg.generatedAt ?? ""));
  if (!Number.isFinite(generatedAtMs)) {
    throw new Error("prime unsigned package missing valid generatedAt");
  }

  const expiresAtMs = Date.parse(String(unsignedPkg.expiresAt ?? ""));
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error("prime unsigned package missing valid expiresAt");
  }
  if (expiresAtMs <= now) {
    throw new Error(`prime unsigned package expired at ${unsignedPkg.expiresAt}`);
  }

  const ageSecs = Math.floor((now - generatedAtMs) / 1000);
  if (ageSecs > DEFAULT_MAX_PACKAGE_AGE_SECS) {
    throw new Error(`prime unsigned package age ${ageSecs}s exceeds max ${DEFAULT_MAX_PACKAGE_AGE_SECS}s`);
  }

  return {
    now: new Date(now).toISOString(),
    generatedAt: unsignedPkg.generatedAt,
    expiresAt: unsignedPkg.expiresAt,
    ageSeconds: ageSecs,
    maxAgeSeconds: DEFAULT_MAX_PACKAGE_AGE_SECS,
  };
}

function toSimulationTx(unsignedPkg) {
  return {
    to: unsignedPkg.target,
    data: unsignedPkg.calldata,
    value: unsignedPkg.value ?? "0",
  };
}

export async function runPrimePreSignChecks({ procurementId, unsignedTxPath, fromAddress }) {
  const unsignedPkg = await readJson(unsignedTxPath, null);
  if (!unsignedPkg) throw new Error(`unsigned package missing at ${unsignedTxPath}`);

  const validation = validatePrimeUnsignedTxPackage(unsignedPkg);
  const freshness = assertFreshness(unsignedPkg);
  const simulation = await simulateUnsignedTx(toSimulationTx(unsignedPkg), fromAddress);

  const report = {
    generatedAt: new Date().toISOString(),
    procurementId: String(procurementId),
    unsignedTxPath,
    validation,
    freshness,
    simulation,
  };

  const reportPath = path.join(path.dirname(unsignedTxPath), "presign_check.json");
  await writeJson(reportPath, report);

  if (!simulation.ok) {
    throw new Error(`prime pre-sign simulation failed for ${unsignedPkg.function}: ${simulation.error}`);
  }

  return { reportPath, report };
}
