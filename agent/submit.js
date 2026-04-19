// ./agent/submit.js
import path from "path";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import { uploadToIpfs, requestJobCompletion } from "./mcp.js";
import { claimJobStageIdempotency, listAllJobStates, setJobState, getJobState, rawJobId } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { getJobArtifactPaths, writeJson } from "./artifact-manager.js";
import { buildUnsignedTxPackage } from "./tx-builder.js";
import { buildSigningManifest } from "./signing-manifest.js";
import { runPreSignChecks, sha256FromJsonFile } from "./pre-sign-checks.js";
import { ingestFinalizedJobReceipt } from "./receipt-ingest.js";

async function assertArtifactBundleReady(job) {
  const required = [
    { label: "executionValidation", path: job.executionValidationPath },
    { label: "publicationValidation", path: job.publicationValidationPath },
    { label: "retrievalPacket", path: job.retrievalPacketPath },
    { label: "deliverable", path: job.artifactPath },
    { label: "brief", path: job.briefPath },
  ];
  const missing = [];
  for (const { label, path: p } of required) {
    if (!p) { missing.push(`${label}: path not set`); continue; }
    try { await fs.access(p); } catch { missing.push(`${label}: ${p}`); }
  }
  if (missing.length > 0) {
    throw new Error(`READY artifact bundle incomplete — missing: ${missing.join(", ")}`);
  }
}

function guessAssetType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".md":
    case ".txt":
      return "TXT";
    case ".json":
      return "JSON";
    case ".pdf":
      return "PDF";
    case ".png":
      return "PNG";
    case ".jpg":
    case ".jpeg":
      return "JPG";
    default:
      return "FILE";
  }
}

function buildCompletionMetadata(job, deliverableUpload) {
  const gatewayDeliverable = deliverableUpload.ipfsUri.replace("ipfs://", "https://ipfs.io/ipfs/");

  return {
    name: `AGI Job Completion · ${job.title ?? `Job ${job.jobId}`}`,
    description: `Final completion package for Job ${job.jobId}.`,
    image: deliverableUpload.ipfsUri,
    attributes: [
      { trait_type: "Kind", value: "job-completion" },
      { trait_type: "Job ID", value: String(job.jobId) },
      { trait_type: "Category", value: job.category ?? "other" },
      { trait_type: "Final Asset Type", value: guessAssetType(job.artifactPath) },
      { trait_type: "Locale", value: CONFIG.LOCALE }
    ],
    properties: {
      schema: "agijobmanager/job-completion/v1",
      kind: "job-completion",
      version: "1.0.0",
      locale: CONFIG.LOCALE,
      title: job.title ?? `Job ${job.jobId}`,
      summary: `Submitted deliverable for job ${job.jobId}.`,
      jobId: rawJobId(job.jobId),
      jobSpecURI: job.specUri ?? null,
      finalDeliverables: [
        {
          name: path.basename(job.artifactPath),
          uri: deliverableUpload.ipfsUri,
          gatewayURI: gatewayDeliverable,
          description: "Primary deliverable produced by the agent"
        }
      ],
      completionStatus: "ready-for-review",
      chainId: CONFIG.CHAIN_ID,
      contract: CONFIG.CONTRACT,
      createdVia: CONFIG.CREATED_VIA,
      generatedAt: new Date().toISOString()
    }
  };
}

export async function submit() {
  requireEnv("PINATA_JWT", CONFIG.PINATA_JWT);
  requireEnv("AGENT_SUBDOMAIN", CONFIG.AGENT_SUBDOMAIN);
  requireEnv("AGENT_ADDRESS", CONFIG.AGENT_ADDRESS);
  requireEnv("ETH_RPC_URL", process.env.ETH_RPC_URL);

  const jobs = await listAllJobStates();
  const ready = jobs.filter((j) => j.status === "deliverable_ready" && j.deliverableIpfs);

  if (ready.length === 0) {
    console.log("[submit] no deliverable-ready jobs for completion packaging");
    return;
  }

  for (const job of ready) {
    try {
      const stageKey = `submit:${job.jobId}:${job.deliverableIpfs?.ipfsUri ?? "na"}:${job.executionValidationPath ?? "na"}:${job.publicationValidationPath ?? "na"}`;
      const claim = await claimJobStageIdempotency(job.jobId, "submit", stageKey);
      if (!claim.claimed) {
        console.log(`[submit] idempotency skip for job ${job.jobId} (${claim.reason})`);
        continue;
      }

      // Check if a prior completion tx has already been finalized — prevent duplicate submission
      const currentState = await getJobState(job.jobId);
      if (currentState?.operatorTx?.requestJobCompletion?.status === "finalized") {
        console.log(`[submit] job ${job.jobId} already has finalized completion tx — skipping`);
        continue;
      }
      const artifactPaths = getJobArtifactPaths(job.jobId);
      await assertArtifactBundleReady(job);

      const completionMetadata = buildCompletionMetadata(job, job.deliverableIpfs);
      await writeJson(artifactPaths.jobCompletion, completionMetadata);

      const completionUpload = await uploadToIpfs(
        CONFIG.PINATA_JWT,
        completionMetadata,
        `job-${job.jobId}-completion.json`
      );

      if (!completionUpload?.ipfsUri) {
        throw new Error("completion metadata upload returned no ipfsUri");
      }

      const preparedTx = await requestJobCompletion(
        rawJobId(job.jobId),
        completionUpload.ipfsUri,
        CONFIG.AGENT_SUBDOMAIN
      );

      const unsignedCompletion = buildUnsignedTxPackage({
        kind: "requestJobCompletion",
        jobId: job.jobId,
        preparedTx,
        extra: {
          jobCompletionURI: completionUpload.ipfsUri,
          deliverableURI: job.deliverableIpfs.ipfsUri,
          agentSubdomain: CONFIG.AGENT_SUBDOMAIN,
          schema: "emperor-os/unsigned-tx/v1",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        }
      });

      await writeJson(artifactPaths.unsignedCompletion, unsignedCompletion);

      const jobCompletionSha256 = await sha256FromJsonFile(artifactPaths.jobCompletion);
      const provenanceBundle = {
        schema: "emperor-os/completion-provenance/v1",
        jobId: String(job.jobId),
        deliverableUri: job.deliverableIpfs.ipfsUri,
        completionUri: completionUpload.ipfsUri,
        jobCompletionSha256,
        executionValidationPath: job.executionValidationPath,
        publicationValidationPath: job.publicationValidationPath,
      };
      const provenanceBundleHash = createHash("sha256")
        .update(JSON.stringify(provenanceBundle), "utf8")
        .digest("hex");

      await runPreSignChecks({
        unsignedPackage: unsignedCompletion,
        reviewContext: {
          jobId: job.jobId,
          jobCompletionUri: completionUpload.ipfsUri,
          agentSubdomain: CONFIG.AGENT_SUBDOMAIN
        },
        fromAddress: CONFIG.AGENT_ADDRESS,
        simulationReportPath: path.join(artifactPaths.dir, "completion_simulation.json"),
        preSignCheckPath: path.join(artifactPaths.dir, "completion_presign_check.json"),
        expectedJobCompletionUri: completionUpload.ipfsUri,
        expectedJobCompletionSha256: jobCompletionSha256
      });

      const signingManifestPath = path.join(artifactPaths.dir, "signing_manifest.json");

      await buildSigningManifest({
        jobId: job.jobId,
        kind: "requestJobCompletion",
        contract: CONFIG.CONTRACT,
        chainId: CONFIG.CHAIN_ID,
        deliverableUri: job.deliverableIpfs.ipfsUri,
        jobCompletionUri: completionUpload.ipfsUri,
        unsignedPackagePath: artifactPaths.unsignedCompletion,
        deliverablePath: artifactPaths.deliverable,
        jobCompletionPath: artifactPaths.jobCompletion,
        publishManifestPath: artifactPaths.publishManifest,
        outputPath: signingManifestPath
      });

      await setJobState(job.jobId, {
        status: "completion_pending_review",
        completionMetadataIpfs: completionUpload,
        unsignedCompletionPath: artifactPaths.unsignedCompletion,
        signingManifestPath,
        completionProvenanceBundle: provenanceBundle,
        completionProvenanceBundleHash: provenanceBundleHash,
        submittedAt: new Date().toISOString(),
        attempts: {
          ...job.attempts,
          submit: (job.attempts?.submit ?? 0) + 1
        }
      });

      console.log(`[submit] staged unsigned completion package for ${job.jobId}`);
    } catch (err) {
      await setJobState(job.jobId, {
        status: "failed",
        failReason: `submit error: ${err.message}`
      });
      console.error(`[submit] job ${job.jobId} failed: ${err.message}`);
    }
  }
}
