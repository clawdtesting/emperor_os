import { getJob } from "./mcp.js";
import { claimJobStageIdempotency, listAllJobStates, setJobState, rawJobId } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { normalizeJob, isAssignedToAddress } from "./job-normalize.js";
import { ingestFinalizedJobReceipt } from "./receipt-ingest.js";

function isPending(job) {
  return ["application_pending_review", "assignment_pending", "applied"].includes(job.status);
}

export async function confirm() {
  requireEnv("AGENT_ADDRESS", CONFIG.AGENT_ADDRESS);

  const jobs = await listAllJobStates();
  const pending = jobs.filter(isPending);

  if (pending.length === 0) {
    console.log("[confirm] no pending application jobs");
    return;
  }

  for (const localJob of pending) {
    const claim = await claimJobStageIdempotency(
      localJob.jobId,
      "confirm",
      `confirm:${localJob.jobId}:${localJob.status}:${localJob.updatedAt ?? "na"}`
    );
    if (!claim.claimed) continue;
    let remote;
    try {
      remote = normalizeJob(await getJob(rawJobId(localJob.jobId)));
    } catch (err) {
      console.error(`[confirm] get_job failed for ${localJob.jobId}: ${err.message}`);
      continue;
    }

    const assignedToUs = isAssignedToAddress(remote, CONFIG.AGENT_ADDRESS);

    if (assignedToUs) {
      const receipt = await ingestFinalizedJobReceipt({ jobId: localJob.jobId, action: "apply" });
      if (!receipt.ok) {
        await setJobState(localJob.jobId, {
          status: "assignment_pending",
          assignmentBlockedReason: `missing finalized apply receipt: ${receipt.reason}`,
          assignmentReceiptCheck: receipt,
        });
        console.log(`[confirm] assignment blocked ${localJob.jobId}: ${receipt.reason}`);
        continue;
      }
      await setJobState(localJob.jobId, {
        status: "assigned",
        assignedAt: new Date().toISOString(),
        assignedAgent: remote.assignedAgent,
        confirmedFromRemote: remote.raw,
        assignmentReceiptRef: receipt,
      });
      console.log(`[confirm] assigned to us: ${localJob.jobId}`);
      continue;
    }

    const remoteStatus = String(remote.status ?? "").toLowerCase();

    if (["cancelled", "canceled", "closed", "completed", "expired", "disputed"].includes(remoteStatus)) {
      await setJobState(localJob.jobId, {
        status: "failed",
        failReason: `Remote job status is ${remoteStatus}`,
        confirmedFromRemote: remote.raw
      });
      console.log(`[confirm] terminal remote status for ${localJob.jobId}: ${remoteStatus}`);
      continue;
    }

    console.log(`[confirm] still pending review/assignment: ${localJob.jobId}`);
  }
}
