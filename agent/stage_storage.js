#!/usr/bin/env node
"use strict";

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { JOB_STATUS, getJobState, setJobState, claimJobStageIdempotency } from "./state.js";
import { getJobArtifactDir, writeJson, readJson } from "./artifact-manager.js";
import { uploadToIpfs } from "./mcp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseInputJobId(rawJobId) {
  const input = String(rawJobId ?? "").trim();
  if (!input) throw new Error("Missing jobId");

  const versioned = input.match(/^(v1|v2|prime)_(\d+)$/i);
  if (versioned) return { explicitVersion: versioned[1].toLowerCase(), numericId: versioned[2] };
  if (!/^\d+$/.test(input)) throw new Error(`Invalid jobId format: ${rawJobId}. Expected <numeric> or <v1|v2|prime>_<numeric>.`);
  return { explicitVersion: null, numericId: input };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(rootDir) {
  const files = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else files.push(fullPath);
    }
  }
  await walk(rootDir);
  return files;
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function safetySelfCheck() {
  const forbiddenChecks = [
    { label: "ethers.Wallet", regex: /ethers\s*\.\s*Wallet/ },
    { label: "sendTransaction", regex: /\bsendTransaction\s*\(/ },
    { label: "signTransaction", regex: /\bsignTransaction\s*\(/ },
    { label: "broadcast", regex: /\bbroadcast\s*\(/ },
    { label: "PRIVATE_KEY", regex: /\bPRIVATE_KEY\b/ },
    { label: "process.env.PRIVATE_KEY", regex: /process\s*\.\s*env\s*\.\s*PRIVATE_KEY/ }
  ];

  const storageFiles = [
    path.join(__dirname, "publish.js"),
    path.join(__dirname, "ipfs-verify.js"),
    path.join(__dirname, "reconcile-completion.js")
  ];

  for (const targetFile of storageFiles) {
    if (!(await pathExists(targetFile))) continue;
    const content = await fs.readFile(targetFile, "utf8");
    for (const check of forbiddenChecks) {
      if (check.regex.test(content)) {
        throw new Error(`[stage_storage] SAFETY VIOLATION: forbidden pattern \"${check.label}\" found in ${targetFile}`);
      }
    }
  }

  console.log("[stage_storage] Safety self-check passed: no signing/broadcast/private-key patterns detected in storage path.");
}

async function resolveVersionedJobId(rawJobId) {
  const { explicitVersion, numericId } = parseInputJobId(rawJobId);
  if (explicitVersion) return `${explicitVersion}_${numericId}`;

  const candidates = [`v1_${numericId}`, `v2_${numericId}`, `prime_${numericId}`];
  const existing = [];
  for (const candidate of candidates) {
    const state = await getJobState(candidate);
    if (state) existing.push(candidate);
  }
  if (existing.length === 1) return existing[0];
  if (existing.length > 1) throw new Error(`Ambiguous jobId ${numericId}. Matching states: ${existing.join(", ")}. Use explicit versioned ID.`);
  throw new Error(`No state found for jobId ${numericId}. Tried: ${candidates.join(", ")}. Use explicit versioned ID if needed.`);
}

async function recomputeAndVerifyHashes(artifactDir, manifest) {
  const results = { verified: [], failed: [], missing: [], extra: [] };
  const manifestArtifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const manifestFiles = new Set(manifestArtifacts.map((a) => a.relativePath));
  const existingFiles = new Set();

  const allFilesAbsolute = await listFilesRecursive(artifactDir);
  const allFiles = allFilesAbsolute.map((filePath) => path.relative(artifactDir, filePath));

  for (const file of allFiles) {
    existingFiles.add(file);
    const manifestEntry = manifestArtifacts.find((a) => a.relativePath === file);
    if (!manifestEntry) {
      results.extra.push(file);
      continue;
    }

    const filePath = path.join(artifactDir, file);
    const content = await fs.readFile(filePath);
    const computedHash = sha256Buffer(content);
    const stats = await fs.stat(filePath);

    if (computedHash === manifestEntry.sha256 && stats.size === manifestEntry.sizeBytes) {
      results.verified.push({ relativePath: file, sha256: computedHash, sizeBytes: stats.size });
    } else {
      results.failed.push({
        relativePath: file,
        expectedHash: manifestEntry.sha256,
        computedHash,
        expectedSize: manifestEntry.sizeBytes,
        computedSize: stats.size
      });
    }
  }

  for (const manifestFile of manifestFiles) {
    if (!existingFiles.has(manifestFile)) {
      results.missing.push({ relativePath: manifestFile, error: "File in manifest but not on disk" });
    }
  }

  return results;
}

async function buildStorageBundle(artifactDir, jobId) {
  const baseRequired = [
    "job_completion.json",
    "artifact_manifest.json",
    "validation_report.json",
    "execution_review_packet.json",
    "execution_plan.json"
  ];
  const traceabilityOptional = [
    "decision.json",
    "spec.normalized.json",
    "apply_review_packet.json",
    "discovery_review_packet.json"
  ];

  const deliverablesDir = path.join(artifactDir, "deliverables");
  const deliverableFilesAbs = await listFilesRecursive(deliverablesDir);
  const deliverableRel = deliverableFilesAbs.map((p) => path.relative(artifactDir, p));

  const candidates = [...baseRequired, ...traceabilityOptional, ...deliverableRel];
  const seen = new Set();
  const files = [];

  for (const relPath of candidates) {
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    const absPath = path.join(artifactDir, relPath);
    if (!(await pathExists(absPath))) continue;
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) continue;
    const buf = await fs.readFile(absPath);
    files.push({
      path: relPath,
      sizeBytes: stat.size,
      sha256: sha256Buffer(buf),
      contentBase64: buf.toString("base64")
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    schema: "emperor-os/storage-bundle/v1",
    jobId,
    createdAt: new Date().toISOString(),
    files
  };
}

async function fetchIpfsTextWithFallback(ipfsUri) {
  const cid = String(ipfsUri || "").replace("ipfs://", "");
  const urls = [
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Failed to fetch IPFS content from all gateways: ${lastError?.message || "unknown error"}`);
}

async function verifyPublishedBundle({ ipfsUri, expectedManifest, expectedDeliverablePaths }) {
  const raw = await fetchIpfsTextWithFallback(ipfsUri);
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.files)) {
    throw new Error("Published bundle is invalid or missing files[]");
  }

  const byPath = new Map(parsed.files.map((f) => [f.path, f]));
  const mustExist = ["job_completion.json", "artifact_manifest.json", ...expectedDeliverablePaths];
  const missingCritical = mustExist.filter((p) => !byPath.has(p));

  const hashMismatches = [];
  for (const artifact of expectedManifest.artifacts || []) {
    const entry = byPath.get(artifact.relativePath);
    if (!entry) continue;
    const decoded = Buffer.from(String(entry.contentBase64 || ""), "base64");
    const actualHash = sha256Buffer(decoded);
    if (actualHash !== artifact.sha256) {
      hashMismatches.push({ path: artifact.relativePath, expected: artifact.sha256, actual: actualHash });
    }
  }

  return {
    ok: missingCritical.length === 0 && hashMismatches.length === 0,
    fetchedAt: new Date().toISOString(),
    ipfsUri,
    bundleSchema: parsed.schema || null,
    totalFiles: parsed.files.length,
    missingCritical,
    hashMismatches,
    verifiedCritical: mustExist.filter((p) => byPath.has(p))
  };
}

async function main() {
  const jobIdArg = process.argv[2];
  const forceFlag = process.argv.includes("--force");

  if (!jobIdArg || jobIdArg === "--force") {
    console.error("Usage: node agent/stage_storage.js <jobId> [--force]");
    process.exit(1);
  }

  await safetySelfCheck();
  if (forceFlag) console.log("[stage_storage] --force flag detected: will overwrite existing reports if present");

  const jobId = await resolveVersionedJobId(String(jobIdArg).trim());
  console.log(`[stage_storage] Starting storage staging for job ${jobId}`);

  const jobState = await getJobState(jobId);
  if (!jobState) {
    console.error(`[stage_storage] Job ${jobId} not found`);
    process.exit(1);
  }
  console.log(`[stage_storage] Job ${jobId} current status: ${jobState.status}`);

  const artifactDir = getJobArtifactDir(jobId);
  const storageStagingReportPath = path.join(artifactDir, "storage_staging_report.json");
  const storagePendingPath = path.join(artifactDir, "storage_pending.json");
  const storagePublishReportPath = path.join(artifactDir, "storage_publish_report.json");
  const ipfsVerificationPath = path.join(artifactDir, "ipfs_verification.json");

  if (!forceFlag && jobState.status === "storage_verified") {
    console.log(`[stage_storage] Idempotency skip for ${jobId}: already in storage_verified`);
    if (await pathExists(storagePublishReportPath)) console.log(`[stage_storage] Existing storage publish report: ${storagePublishReportPath}`);
    if (await pathExists(ipfsVerificationPath)) console.log(`[stage_storage] Existing ipfs verification: ${ipfsVerificationPath}`);
    const existingPublish = await readJson(storagePublishReportPath);
    if (existingPublish?.jobCompletionURI) console.log(`[stage_storage] Existing jobCompletionURI: ${existingPublish.jobCompletionURI}`);
    process.exit(0);
  }

  const allowedStates = new Set([JOB_STATUS.DELIVERABLE_READY, JOB_STATUS.STORAGE_PENDING]);
  if (!allowedStates.has(jobState.status)) {
    console.error(`[stage_storage] Job ${jobId} must be in 'deliverable_ready' or 'storage_pending'. Current: ${jobState.status}`);
    process.exit(1);
  }

  if (!forceFlag && jobState.status === JOB_STATUS.STORAGE_PENDING) {
    const publishEnabled = process.env.IPFS_PUBLISH_ENABLED === "1";
    if (!publishEnabled) {
      console.log(`[stage_storage] Idempotency skip for ${jobId}: already in storage_pending`);
      if (await pathExists(storageStagingReportPath)) console.log(`[stage_storage] Existing storage staging report: ${storageStagingReportPath}`);
      if (await pathExists(storagePendingPath)) console.log(`[stage_storage] Existing storage pending: ${storagePendingPath}`);
      console.log("[stage_storage] No fake IPFS URI was claimed.");
      process.exit(0);
    }
  }

  if (!forceFlag) {
    const claim = await claimJobStageIdempotency(jobId, "storage_stage", `storage_stage:${jobId}:completed`);
    if (!claim.claimed && jobState.status === JOB_STATUS.DELIVERABLE_READY) {
      console.log(`[stage_storage] Idempotency skip for ${jobId} (reason: ${claim.reason})`);
      if (await pathExists(storageStagingReportPath)) console.log(`[stage_storage] Existing storage staging report: ${storageStagingReportPath}`);
      if (await pathExists(storagePendingPath)) console.log(`[stage_storage] Existing storage pending: ${storagePendingPath}`);
      process.exit(0);
    }
  } else {
    console.log("[stage_storage] --force: skipping idempotency check");
  }

  const requiredFiles = ["job_completion.json", "validation_report.json", "artifact_manifest.json", "execution_review_packet.json"];
  const missingFiles = [];
  for (const f of requiredFiles) if (!(await pathExists(path.join(artifactDir, f)))) missingFiles.push(f);
  const deliverablesDir = path.join(artifactDir, "deliverables");
  const deliverables = (await pathExists(deliverablesDir)) ? await listFilesRecursive(deliverablesDir) : [];
  if (deliverables.length === 0) missingFiles.push("deliverables/ (directory with at least one file)");
  if (missingFiles.length > 0) {
    console.error(`[stage_storage] Missing required files: ${missingFiles.join(", ")}`);
    process.exit(1);
  }

  const manifest = await readJson(path.join(artifactDir, "artifact_manifest.json"));
  if (!manifest || !Array.isArray(manifest.artifacts)) {
    console.error("[stage_storage] Could not load valid artifact_manifest.json with artifacts[]");
    process.exit(1);
  }

  console.log("[stage_storage] Verifying artifact hashes against manifest...");
  const verificationResults = await recomputeAndVerifyHashes(artifactDir, manifest);
  const allVerified = verificationResults.failed.length === 0 && verificationResults.missing.length === 0;

  await writeJson(storageStagingReportPath, {
    schema: "emperor-os/storage-staging-report/v1",
    jobId,
    stagedAt: new Date().toISOString(),
    artifactManifestVerified: allVerified,
    verificationResults: {
      totalFiles: manifest.artifacts.length,
      verified: verificationResults.verified.length,
      failed: verificationResults.failed,
      missing: verificationResults.missing,
      extra: verificationResults.extra
    }
  });
  console.log(`[stage_storage] Wrote storage staging report: ${storageStagingReportPath}`);

  if (!allVerified) {
    console.error("[stage_storage] Artifact manifest verification FAILED. Refusing publish/state transition.");
    process.exit(1);
  }

  const pinataJwt = process.env.PINATA_JWT;
  const ipfsPublishEnabled = process.env.IPFS_PUBLISH_ENABLED === "1";
  const pinataEnabled = Boolean(pinataJwt) && ipfsPublishEnabled;

  if (!pinataEnabled) {
    console.log("[stage_storage] No real storage provider configured for publish.");
    console.log("[stage_storage] PINATA_JWT:", pinataJwt ? "configured" : "not configured");
    console.log("[stage_storage] IPFS_PUBLISH_ENABLED:", ipfsPublishEnabled ? "1" : "not 1");
    await writeJson(storagePendingPath, {
      schema: "emperor-os/storage-pending/v1",
      jobId,
      status: "pending_external_storage",
      reason: "PINATA_JWT not configured or IPFS_PUBLISH_ENABLED is not 1",
      claimIpfsUri: false,
      jobCompletionUri: null,
      nextAction: "Configure a real storage provider and rerun storage stage",
      humanReviewRequired: true
    });
    console.log(`[stage_storage] Wrote storage pending: ${storagePendingPath}`);

    if (jobState.status !== JOB_STATUS.STORAGE_PENDING) {
      await setJobState(jobId, {
        status: JOB_STATUS.STORAGE_PENDING,
        statusMetadata: {
          semanticMeaning: "artifacts_verified_locally_external_storage_pending",
          artifactManifestVerified: true,
          externalStoragePublished: false,
          fetchbackVerified: false,
          jobCompletionUri: null,
          txPackageBuilt: false,
          requiresHumanApproval: true,
          nextStage: "external_storage_upload"
        },
        stagedAt: new Date().toISOString(),
        attempts: { ...jobState.attempts, storage: (jobState.attempts?.storage || 0) + 1 }
      });
      console.log(`[stage_storage] Job ${jobId} state transition: ${jobState.status} → ${JOB_STATUS.STORAGE_PENDING}`);
    }
    console.log("[stage_storage] No fake IPFS URI was claimed.");
    console.log("[stage_storage] No completion transaction package was generated.");
    console.log("[stage_storage] Safety confirmed: No signing, broadcasting, or private key usage.");
    return;
  }

  const bundle = await buildStorageBundle(artifactDir, jobId);
  console.log(`[stage_storage] Publishing bundle to Pinata with ${bundle.files.length} files...`);
  const uploadResult = await uploadToIpfs(pinataJwt, bundle, `${jobId}-storage-bundle.json`);

  const rootUri = uploadResult?.ipfsUri;
  if (!rootUri || !rootUri.startsWith("ipfs://")) {
    throw new Error("Pinata upload did not return a valid ipfs:// URI");
  }

  const publishReport = {
    schema: "emperor-os/storage-publish-report/v1",
    jobId,
    provider: "pinata",
    rootCid: rootUri.replace("ipfs://", ""),
    jobCompletionURI: rootUri,
    uploadedFiles: bundle.files.map((f) => ({ path: f.path, sizeBytes: f.sizeBytes, sha256: f.sha256 })),
    createdAt: new Date().toISOString(),
    humanReviewRequired: true
  };
  await writeJson(storagePublishReportPath, publishReport);
  console.log(`[stage_storage] Wrote storage publish report: ${storagePublishReportPath}`);

  const expectedDeliverablePaths = bundle.files.map((f) => f.path).filter((p) => p.startsWith("deliverables/"));
  const verification = await verifyPublishedBundle({ ipfsUri: rootUri, expectedManifest: manifest, expectedDeliverablePaths });
  verification.jobCompletionURI = rootUri;
  await writeJson(ipfsVerificationPath, {
    schema: "emperor-os/ipfs-verification/v1",
    jobId,
    ...verification,
    humanReviewRequired: true
  });
  console.log(`[stage_storage] Wrote IPFS verification report: ${ipfsVerificationPath}`);

  if (!verification.ok) {
    console.error("[stage_storage] Fetchback verification FAILED. Staying out of storage_verified.");
    process.exit(1);
  }

  await setJobState(jobId, {
    status: "storage_verified",
    statusMetadata: {
      semanticMeaning: "artifacts_verified_locally_and_published_with_fetchback",
      artifactManifestVerified: true,
      externalStoragePublished: true,
      fetchbackVerified: true,
      jobCompletionUri: rootUri,
      txPackageBuilt: false,
      signed: false,
      broadcast: false,
      requiresHumanApproval: true,
      nextStage: "completion_package_build"
    },
    storagePublishedAt: new Date().toISOString(),
    attempts: { ...jobState.attempts, storage: (jobState.attempts?.storage || 0) + 1 }
  });

  console.log(`[stage_storage] Job ${jobId} state transition: ${jobState.status} → storage_verified`);
  console.log(`[stage_storage] jobCompletionURI: ${rootUri}`);
  console.log("[stage_storage] No completion transaction package was generated.");
  console.log("[stage_storage] Safety confirmed: No signing, broadcasting, or private key usage.");
}

main().catch((err) => {
  console.error("[stage_storage] Fatal error:", err);
  process.exit(1);
});
