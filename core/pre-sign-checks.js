// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/pre-sign-checks.js
import { promises as fs } from "fs";
import path from "path";
import { writeJson } from "./artifact-manager.js";
import { validateUnsignedTxPackage } from "./tx-validator.js";
import { simulateUnsignedTx } from "./simulation.js";
import { verifyIpfsTextHash } from "./ipfs-verify.js";

export async function runPreSignChecks({
  unsignedPackage,
  reviewContext,
  fromAddress,
  simulationReportPath,
  preSignCheckPath,
  expectedJobCompletionUri = null,
  expectedJobCompletionSha256 = null
}) {
  const expiresAt = unsignedPackage?.expiresAt ? Date.parse(unsignedPackage.expiresAt) : null;
  if (expiresAt != null) {
    if (!Number.isFinite(expiresAt)) {
      throw new Error(`Invalid expiresAt timestamp: ${unsignedPackage.expiresAt}`);
    }
    if (Date.now() > expiresAt) {
      throw new Error(`Unsigned package expired at ${unsignedPackage.expiresAt}`);
    }
  }

  const decode = await validateUnsignedTxPackage(unsignedPackage, reviewContext);
  const simulation = await simulateUnsignedTx(unsignedPackage, fromAddress);

  let ipfsVerification = null;
  if (expectedJobCompletionUri && expectedJobCompletionSha256) {
    ipfsVerification = await verifyIpfsTextHash(
      expectedJobCompletionUri,
      expectedJobCompletionSha256
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    decode,
    simulation,
    ipfsVerification
  };

  if (simulationReportPath) {
    await writeJson(simulationReportPath, simulation);
  }

  if (preSignCheckPath) {
    await writeJson(preSignCheckPath, report);
  }

  if (!simulation.ok) {
    throw new Error(`Pre-sign simulation failed: ${simulation.error}`);
  }

  if (ipfsVerification && !ipfsVerification.ok) {
    throw new Error(
      `IPFS verification failed: expected ${ipfsVerification.expectedSha256}, got ${ipfsVerification.actualSha256}`
    );
  }

  return report;
}

export async function sha256FromJsonFile(filePath) {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  const crypto = await import("crypto");
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}
