// ./agent/evaluate.js
import { listAllJobStates, setJobState } from "./state.js";
import { evaluateJobStrategy } from "./strategy.js";
import { ensureJobArtifactDir, getJobArtifactPaths, writeJson } from "./artifact-manager.js";

export async function evaluate() {
  const jobs = await listAllJobStates();
  const queued = jobs.filter((j) => j.status === "queued");

  if (queued.length === 0) {
    console.log("[evaluate] no queued jobs");
    return;
  }

  for (const job of queued) {
    const decision = evaluateJobStrategy(job);
    await ensureJobArtifactDir(job.jobId);
    const artifactPaths = getJobArtifactPaths(job.jobId);
    await writeJson(artifactPaths.strategy, decision);

    if (!decision.shouldApply) {
      await setJobState(job.jobId, {
        status: "failed",
        strategy: decision,
        failReason: decision.reason
      });

      console.log(`[evaluate] ${job.jobId} -> failed :: ${decision.reason}`);
      continue;
    }

    await setJobState(job.jobId, {
      status: "scored",
      strategy: decision,
      score: decision.scores.confidence
    });

    console.log(
      `[evaluate] ${job.jobId} -> scored confidence=${decision.scores.confidence} ev=${decision.scores.expectedValueScore}`
    );
  }
}
