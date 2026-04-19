// agent/signing-manifest.js
// Builds a human-reviewable signing manifest with SHA-256 hashes of all
// relevant artifacts so the operator can verify integrity before signing.
//
// Schema parity note: the top-level shape mirrors the prime-review-manifest/v1
// produced by prime-artifact-builder.js so both lanes expose the same keys
// (schema, generatedAt, jobId/procurementId, phase/kind, files, artifacts,
// checklist, warnings, instruction).

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
 *
 * @param {object} opts
 * @param {string|number} opts.jobId
 * @param {string}        opts.kind
 * @param {string}        opts.contract
 * @param {number|string} opts.chainId
 * @param {string}        [opts.deliverableUri]
 * @param {string}        [opts.jobCompletionUri]
 * @param {string}        [opts.unsignedPackagePath]
 * @param {string}        [opts.deliverablePath]
 * @param {string}        [opts.jobCompletionPath]
 * @param {string}        [opts.publishManifestPath]
 * @param {string}        [opts.outputPath]
 * @param {string[]}      [opts.warnings]   - optional operator warnings
 * @returns {Promise<object>}
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
  warnings = [],
}) {
  const hashes = {};
  const paths = {
    unsignedPackage: unsignedPackagePath,
    deliverable: deliverablePath,
    jobCompletion: jobCompletionPath,
    publishManifest: publishManifestPath,
  };

  const fileList = [];
  for (const [label, p] of Object.entries(paths)) {
    if (p) {
      hashes[label] = await hashFile(p);
      fileList.push(path.basename(p));
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
    files: fileList,
    artifacts: hashes,
    checklist: [
      "Verify job ID matches the intended job",
      "Verify deliverable URI resolves to correct content",
      "Verify completion metadata URI resolves and references the deliverable",
      "Verify contract address and chain ID are correct",
      "Verify unsigned tx data matches expected function selector",
      "Confirm artifact SHA-256 hashes match local files",
    ],
    warnings,
    instruction: "Complete every checklist item before signing the unsigned tx package. " +
                 "Reject or defer if any item cannot be confirmed.",
  };

  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2));
  }

  return manifest;
}
