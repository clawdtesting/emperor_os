import { getJob } from "./mcp.js";
import { claimJobStageIdempotency, listAllJobStates, setJobState } from "./state.js";
import { normalizeJob } from "./job-normalize.js";
import { ingestFinalizedJobReceipt } from "./receipt-ingest.js";

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
      const remote = normalizeJob(await getJob(Number(job.jobId)));
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
        await setJobState(job.jobId, {
          status: "completed",
          completedAt: new Date().toISOString(),
          reconciledFromRemote: remote.raw,
          completionReceiptRef: receipt,
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
