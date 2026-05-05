// agent/list_review_queue.js
// Lists all jobs waiting for human review (in review_pending state).

import { listAllJobStates } from "./state.js";

async function listReviewQueue() {
  const jobs = await listAllJobStates();
  const reviewJobs = jobs.filter(job => job.status === "review_pending");
  
  console.log(`[list_review_queue] Found ${reviewJobs.length} jobs waiting for human review:`);
  
  if (reviewJobs.length === 0) {
    console.log("  (none)");
    return;
  }
  
  for (const job of reviewJobs) {
    console.log(`  - Job ID: ${job.jobId}`);
    console.log(`    Title: ${job.title || '(no title)'}`);
    console.log(`    Category: ${job.category || '(no category)'}`);
    console.log(`    Payout: ${job.payout || '(no payout)'}`);
    console.log(`    Discovered at: ${job.discoveredAt ?? '(unknown)'}`);
    console.log(`    Artifact Dir: ${job.artifactDir || '(not set)'}`);
    console.log("");
  }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  listReviewQueue().catch(err => {
    console.error("[list_review_queue] Error:", err);
    process.exit(1);
  });
}