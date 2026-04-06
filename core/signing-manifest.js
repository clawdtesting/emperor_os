// ./agent/signing-manifest.js
import { promises as fs } from "fs";
import { sha256Text } from "./ipfs-verify.js";
import { writeJson } from "./artifact-manager.js";

async function sha256File(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return sha256Text(raw);
}

export async function buildSigningManifest({
  schemaVersion = "emperor-os/signing-manifest/v1",
  jobId,
  kind,
  contract,
  chainId,
  deliverableUri = null,
  jobCompletionUri = null,
  unsignedPackagePath,
  deliverablePath = null,
  jobCompletionPath = null,
  publishManifestPath = null,
  outputPath
}) {
  const fileHashes = {};

  if (deliverablePath) {
    fileHashes.deliverableSha256 = await sha256File(deliverablePath);
  }

  if (jobCompletionPath) {
    fileHashes.jobCompletionSha256 = await sha256File(jobCompletionPath);
  }

  if (publishManifestPath) {
    fileHashes.publishManifestSha256 = await sha256File(publishManifestPath);
  }

  if (unsignedPackagePath) {
    fileHashes.unsignedPackageSha256 = await sha256File(unsignedPackagePath);
  }

  const manifest = {
    schema: schemaVersion,
    generatedAt: new Date().toISOString(),
    jobId: Number(jobId),
    kind,
    contract,
    chainId,
    deliverableUri,
    jobCompletionUri,
    fileHashes
  };

  await writeJson(outputPath, manifest);
  return manifest;
}
