import { getJob } from "./mcp.js";
import { listAllJobStates, setJobState } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { normalizeJob, isAssignedToAddress } from "./job-normalize.js";

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
