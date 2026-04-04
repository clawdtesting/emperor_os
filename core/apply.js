// /home/ubuntu/emperor_OS/.openclaw/workspace/agent/apply.js
import { applyForJob } from "./mcp.js";
import { listAllJobStates, setJobState } from "./state.js";
import { CONFIG, requireEnv } from "./config.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson } from "./artifact-manager.js";
import { buildUnsignedApplyTxPackage } from "./tx-builder.js";

function pickBest(scoredJobs) {
  return [...scoredJobs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
}

export async function apply() {
  requireEnv("AGENT_SUBDOMAIN", CONFIG.AGENT_SUBDOMAIN);

  const jobs = await listAllJobStates();
  const candidates = jobs.filter((j) => j.status === "scored");

  if (candidates.length === 0) {
    console.log("[apply] no scored jobs");
    return;
  }

  const job = pickBest(candidates);
  if (!job) {
    console.log("[apply] no candidate selected");
    return;
  }

  const preparedTx = await applyForJob(Number(job.jobId), CONFIG.AGENT_SUBDOMAIN);

  if (!preparedTx || typeof preparedTx !== "object") {
    throw new Error(`[apply] invalid MCP response for job ${job.jobId}`);
  }

  await ensureJobArtifactDir(job.jobId);
  const artifactPaths = getJobArtifactPaths(job.jobId);

  const unsignedApply = buildUnsignedApplyTxPackage({
    jobId: job.jobId,
    preparedTx,
    agentSubdomain: CONFIG.AGENT_SUBDOMAIN,
  });

  await writeJson(artifactPaths.unsignedApply, unsignedApply);

  await setJobState(job.jobId, {
    status: "application_pending_review",
    applyPreparedTx: preparedTx,
    unsignedApplyPath: artifactPaths.unsignedApply,
    attempts: {
      ...job.attempts,
      apply: (job.attempts?.apply ?? 0) + 1
    }
  });

  console.log(`[apply] staged unsigned apply package for job ${job.jobId}`);
}
