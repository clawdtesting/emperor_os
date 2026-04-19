import { promises as fs } from "fs";
import { getJob } from "./mcp.js";
import { claimJobStageIdempotency, listAllJobStates, setJobState, rawJobId } from "./state.js";
import { normalizeJob } from "./job-normalize.js";
import { ingestFinalizedJobReceipt } from "./receipt-ingest.js";
import { getJobArtifactPaths, writeJson } from "./artifact-manager.js";
import { extractSteppingStone } from "./prime-retrieval.js";

async function fileExists(p) {
  if (!p) return false;
  try { await fs.access(p); return true; } catch { return false; }
}

// Builds the canonical completionArchiveRecord shape. Both the "already
// extracted" fast-path and the fresh-extraction path write the same top-level
// keys so downstream readers never see a partial schema.
function buildArchiveRecord({
  jobId,
  archiveId,
  completionURI,
  deliverableURI,
  sourceArtifact,
  skippedExtraction = false,
  reason = null,
  timestampKey,        // "recordedAt" when skipped, "extractedAt" when fresh
  timestamp,
}) {
  return {
    schema: "emperor-os/v1-completion-archive-record/v1",
    jobId: String(jobId),
    archiveId,
    completionURI: completionURI ?? "",
    deliverableURI: deliverableURI ?? "",
    sourceArtifact: sourceArtifact ?? null,
    skippedExtraction,
    reason: reason ?? null,
    [timestampKey]: timestamp,
  };
}

async function ensureCompletionArchiveExtraction(job, remote) {
  const existingArchiveId = String(job?.completionArchive?.archiveId || "").trim();
  const artifactPaths = getJobArtifactPaths(job.jobId);

  const completionURI = String(job?.completionMetadataIpfs?.ipfsUri || "");
  const deliverableURI = String(job?.deliverableIpfs?.ipfsUri || "");

  if (existingArchiveId) {
    const record = buildArchiveRecord({
      jobId: job.jobId,
      archiveId: existingArchiveId,
      completionURI,
      deliverableURI,
      sourceArtifact: artifactPaths.jobCompletion,
      skippedExtraction: true,
      reason: "already_extracted",
      timestampKey: "recordedAt",
      timestamp: new Date().toISOString(),
    });
    await writeJson(artifactPaths.completionArchiveRecord, record);
    return { ok: true, archiveId: existingArchiveId, path: artifactPaths.completionArchiveRecord };
  }

  // Guard: jobCompletion artifact must be on disk before we attempt to archive it.
  if (!(await fileExists(artifactPaths.jobCompletion))) {
    throw new Error(
      `ensureCompletionArchiveExtraction: jobCompletion artifact missing at ${artifactPaths.jobCompletion} — cannot extract`
    );
  }

  const archiveId = await extractSteppingStone({
    source: "v1",
    jobId: String(job.jobId),
    procurementId: `job_${job.jobId}`,
    phase: "completion",
    artifactPath: artifactPaths.jobCompletion,
    title: `AGIJobManager v1 completion: Job ${job.jobId}`,
    summary: `Finalized completion metadata and operator tx package for Job ${job.jobId}.`,
    tags: ["v1", "completion", "mandatory-extraction"],
    metadata: {
      domain: String(job?.category || "other"),
      deliverableType: "job-completion",
      qualityScore: Number(remote?.validation?.approvals ?? 0) - Number(remote?.validation?.disapprovals ?? 0),
      wasAccepted: true,
      timestamp: new Date().toISOString(),
    },
    primitive: {
      jobId: String(job.jobId),
      status: "completed",
      completionURI,
      deliverableURI,
      operatorTx: job?.operatorTx?.requestJobCompletion ?? null,
      completionProvenanceBundleHash: job?.completionProvenanceBundleHash ?? null,
    },
  });

  const record = buildArchiveRecord({
    jobId: job.jobId,
    archiveId,
    completionURI,
    deliverableURI,
    sourceArtifact: artifactPaths.jobCompletion,
    skippedExtraction: false,
    reason: null,
    timestampKey: "extractedAt",
    timestamp: new Date().toISOString(),
  });
  await writeJson(artifactPaths.completionArchiveRecord, record);
  return { ok: true, archiveId, path: artifactPaths.completionArchiveRecord };
}

const TERMINAL_FAILURE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "closed",
  "expired",
  "disputed"
]);

export async function reconcileCompletion() {
  const jobs = await listAllJobStates();
  const pending = jobs.filter((j) => j.status === "completion_pending_review");

  if (pending.length === 0) {
    console.log("[reconcile_completion] no completion-pending jobs");
    return;
  }

  for (const job of pending) {
    try {
      const claim = await claimJobStageIdempotency(
        job.jobId,
        "reconcile_completion",
        `reconcile_completion:${job.jobId}:${job.updatedAt ?? "na"}`
      );
      if (!claim.claimed) continue;
      const remote = normalizeJob(await getJob(rawJobId(job.jobId)));
      const remoteStatus = String(remote?.status ?? "").toLowerCase();

      if (remoteStatus === "completed") {
        const receipt = await ingestFinalizedJobReceipt({ jobId: job.jobId, action: "completion" });
        if (!receipt.ok) {
          await setJobState(job.jobId, {
            completionBlockedReason: `missing finalized completion receipt: ${receipt.reason}`,
            completionReceiptCheck: receipt,
          });
          console.log(`[reconcile_completion] completed blocked ${job.jobId}: ${receipt.reason}`);
          continue;
        }

        const extraction = await ensureCompletionArchiveExtraction(job, remote);
        await setJobState(job.jobId, {
          status: "completed",
          completedAt: new Date().toISOString(),
          reconciledFromRemote: remote.raw,
          completionReceiptRef: receipt,
          completionArchive: {
            archiveId: extraction.archiveId,
            recordPath: extraction.path,
            extractedAt: new Date().toISOString(),
          },
        });
        console.log(`[reconcile_completion] completed: ${job.jobId}`);
        continue;
      }

      if (remoteStatus === "submitted") {
        const receipt = await ingestFinalizedJobReceipt({ jobId: job.jobId, action: "completion" });
        if (!receipt.ok) {
          await setJobState(job.jobId, {
            completionBlockedReason: `missing finalized completion receipt: ${receipt.reason}`,
            completionReceiptCheck: receipt,
          });
          console.log(`[reconcile_completion] submitted blocked ${job.jobId}: ${receipt.reason}`);
          continue;
        }
        await setJobState(job.jobId, {
          status: "submitted",
          reconciledAt: new Date().toISOString(),
          reconciledFromRemote: remote.raw,
          completionReceiptRef: receipt,
        });
        console.log(`[reconcile_completion] submitted: ${job.jobId}`);
        continue;
      }

      if (TERMINAL_FAILURE_STATUSES.has(remoteStatus)) {
        await setJobState(job.jobId, {
          status: "failed",
          failReason: `completion reconciliation remote terminal status: ${remoteStatus}`,
          reconciledFromRemote: remote.raw
        });
        console.log(`[reconcile_completion] failed terminal ${job.jobId}: ${remoteStatus}`);
        continue;
      }

      console.log(`[reconcile_completion] still pending ${job.jobId}: remote status=${remoteStatus || "unknown"}`);
    } catch (err) {
      console.error(`[reconcile_completion] ${job.jobId} polling failed: ${err.message}`);
    }
  }
}
