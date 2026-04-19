// ./agent/recovery.js
import { promises as fs } from "fs";
import { listAllJobStates, setJobState } from "./state.js";

async function fileExists(p) {
  if (!p) return false;
  try { await fs.access(p); return true; } catch { return false; }
}

export async function recover() {
  const jobs = await listAllJobStates();

  if (jobs.length === 0) {
    console.log("[recovery] no prior state found");
    return;
  }

  for (const job of jobs) {
    if (job.status === "working") {
      await setJobState(job.jobId, {
        status: "assigned",
        recoveryNote: "Recovered from interrupted working state",
      });
      console.log(`[recovery] reset ${job.jobId}: working -> assigned`);
      continue;
    }

    if (job.status === "deliverable_ready") {
      // If core artifact files are absent the deliverable was never fully
      // written. Reset to working so the execute step can re-run cleanly.
      const deliverableOk = await fileExists(job.artifactPath);
      const briefOk = await fileExists(job.briefPath);
      if (!deliverableOk || !briefOk) {
        await setJobState(job.jobId, {
          status: "working",
          recoveryNote: "Recovered: deliverable_ready with missing core artifacts -> working",
        });
        console.log(`[recovery] reset ${job.jobId}: deliverable_ready (missing artifacts) -> working`);
      }
      continue;
    }

    if (job.status === "completion_pending_review") {
      // If the signing manifest or unsigned tx package are absent, submit was
      // interrupted after the status write. Roll back so submit can retry.
      const signingOk = await fileExists(job.signingManifestPath);
      const unsignedOk = await fileExists(job.unsignedCompletionPath);
      if (!signingOk || !unsignedOk) {
        await setJobState(job.jobId, {
          status: "deliverable_ready",
          recoveryNote: "Recovered: completion_pending_review with missing signing artifacts -> deliverable_ready",
        });
        console.log(`[recovery] reset ${job.jobId}: completion_pending_review (missing signing artifacts) -> deliverable_ready`);
      }
      continue;
    }

    if (job.status === "publication_pending") {
      // publication_pending is durable/retry-safe by design; validate() will retry when publication is available.
      console.log(`[recovery] publication_pending preserved for ${job.jobId}`);
    }
  }

  console.log(`[recovery] scanned ${jobs.length} state file(s)`);
}
