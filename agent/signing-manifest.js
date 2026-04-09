// agent/signing-manifest.js
// Builds a human-reviewable signing manifest with SHA-256 hashes of all
// relevant artifacts so the operator can verify integrity before signing.

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

async function hashFile(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return createHash("sha256").update(data, "utf8").digest("hex");
  } catch {
    return null;
  }
}

/**
 * Build a signing manifest that the operator reviews before signing.
 */
export async function buildSigningManifest({
  jobId,
  kind,
  contract,
  chainId,
  deliverableUri,
  jobCompletionUri,
  unsignedPackagePath,
  deliverablePath,
  jobCompletionPath,
  publishManifestPath,
  outputPath,
}) {
  const hashes = {};
  const paths = {
    unsignedPackage: unsignedPackagePath,
    deliverable: deliverablePath,
    jobCompletion: jobCompletionPath,
    publishManifest: publishManifestPath,
  };

  for (const [label, p] of Object.entries(paths)) {
    if (p) {
      hashes[label] = await hashFile(p);
    }
  }

  const manifest = {
    schema: "emperor-os/signing-manifest/v1",
    generatedAt: new Date().toISOString(),
    jobId: String(jobId),
    kind,
    contract,
    chainId,
    deliverableUri: deliverableUri || null,
    jobCompletionUri: jobCompletionUri || null,
    artifacts: hashes,
    checklist: [
      "Verify job ID matches the intended job",
      "Verify deliverable URI resolves to correct content",
      "Verify completion metadata URI resolves and references the deliverable",
      "Verify contract address and chain ID are correct",
      "Verify unsigned tx data matches expected function selector",
      "Confirm artifact SHA-256 hashes match local files",
    ],
  };

  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
  }

  return manifest;
}
