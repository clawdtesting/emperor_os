// ./agent/recovery.js
import { listAllJobStates, setJobState } from "./state.js";

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
        recoveryNote: "Recovered from interrupted working state"
      });
      console.log(`[recovery] reset ${job.jobId} from working -> assigned`);
    }
  }

  console.log(`[recovery] scanned ${jobs.length} state file(s)`);
}