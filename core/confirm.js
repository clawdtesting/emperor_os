// ./agent/confirm.js
import { getJob } from "./mcp.js";
import { listAllJobStates, setJobState } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { normalizeJob, isAssignedToAddress } from "./job-normalize.js";
import { ingestFinalizedJobReceipt } from "./receipt-ingest.js";

function isPending(job) {
  return ["application_pending_review", "assignment_pending", "applied", "completion_pending_review"].includes(job.status);
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
    if (localJob.status === "application_pending_review" || localJob.status === "applied") {
      const applyIngest = await ingestFinalizedJobReceipt({
        jobId: localJob.jobId,
        action: "apply"
      });
      if (!applyIngest.ok) {
        console.log(`[confirm] apply handoff blocked for ${localJob.jobId}: ${applyIngest.reason}`);
        continue;
      }
      if (localJob.status !== "assignment_pending") {
        await setJobState(localJob.jobId, {
          status: "assignment_pending",
          applyFinalizedTx: applyIngest.txHash,
          applyFinalizedAt: new Date().toISOString()
        });
      }
    }

    if (localJob.status === "completion_pending_review") {
      const completionIngest = await ingestFinalizedJobReceipt({
        jobId: localJob.jobId,
        action: "completion"
      });
      if (!completionIngest.ok) {
        console.log(`[confirm] completion handoff blocked for ${localJob.jobId}: ${completionIngest.reason}`);
        continue;
      }
    }

    let remote;
    try {
      remote = normalizeJob(await getJob(Number(localJob.jobId)));
    } catch (err) {
      console.error(`[confirm] get_job failed for ${localJob.jobId}: ${err.message}`);
      continue;
    }

    const assignedToUs = isAssignedToAddress(remote, CONFIG.AGENT_ADDRESS);

    if (assignedToUs) {
      await setJobState(localJob.jobId, {
        status: "assigned",
        assignedAt: new Date().toISOString(),
        assignedAgent: remote.assignedAgent,
        confirmedFromRemote: remote.raw
      });
      console.log(`[confirm] assigned to us: ${localJob.jobId}`);
      continue;
    }

    const remoteStatus = String(remote.status ?? "").toLowerCase();

    if (["cancelled", "canceled", "closed", "completed", "expired", "disputed"].includes(remoteStatus)) {
      const derivedFailureStatus = localJob.status === "completion_pending_review" && remoteStatus === "completed"
        ? "submitted"
        : "failed";
      const patch = {
        status: derivedFailureStatus,
        confirmedFromRemote: remote.raw
      };
      if (derivedFailureStatus === "failed") {
        patch.failReason = `Remote job status is ${remoteStatus}`;
      }
      await setJobState(localJob.jobId, patch);
      console.log(`[confirm] terminal remote status for ${localJob.jobId}: ${remoteStatus}`);
      continue;
    }

    console.log(`[confirm] still pending review/assignment: ${localJob.jobId}`);
  }
}
