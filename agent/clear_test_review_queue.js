// agent/clear_test_review_queue.js
// Safely removes or quarantines test-created forced-open review entries
// Only targets v1_0 and v2_0 which were created from completed Job 0 during testing

import { listAllJobStates, getJobState, setJobState, deleteJobState } from "./state.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHIVE_TEST_DIR = path.join(__dirname, "..", "archive", "test_cleanup");

// Test job IDs to clean up
const TEST_JOB_IDS = ["v1_0", "v2_0", "v1_fixture_apply_001"];

async function ensureArchiveDir() {
  await fs.mkdir(ARCHIVE_TEST_DIR, { recursive: true });
}

async function archiveTestJob(jobId, jobState) {
  await ensureArchiveDir();
  
  // Create archive marker explaining this was a forced-open test artifact
  const marker = {
    archivedAt: new Date().toISOString(),
    originalJobId: jobId,
    reason: "Forced-open test artifact from completed Job 0 during testing",
    originalState: jobState,
    note: "This job was created via DISCOVERY_FORCE_OPEN_FOR_TESTING=1 and should not appear in active review queue"
  };
  
  const markerPath = path.join(ARCHIVE_TEST_DIR, `${jobId}_archived_test_marker.json`);
  await fs.writeFile(markerPath, JSON.stringify(marker, null, 2), "utf8");
  
  console.log(`[clear_test_review_queue] Archived test job ${jobId} to ${markerPath}`);
}

async function clearTestReviewQueue() {
  console.log("[clear_test_review_queue] Starting cleanup of test forced-open review entries...");
  
  const allJobs = await listAllJobStates();
  let cleanedCount = 0;
  
  for (const job of allJobs) {
    // Only process our specific test job IDs
    if (!TEST_JOB_IDS.includes(job.jobId)) {
      continue;
    }
    
    console.log(`[clear_test_review_queue] Found test job ${job.jobId} with status: ${job.status}`);
    
    // Only act on jobs that are in review_pending state (the problematic ones)
    if (job.status === "review_pending") {
      // Get the full job state for archiving
      const jobState = await getJobState(job.jobId);
      if (jobState) {
        await archiveTestJob(job.jobId, jobState);
      }
      
      // Remove from active state (this removes it from review queue)
      await deleteJobState(job.jobId);
      console.log(`[clear_test_review_queue] Removed test job ${job.jobId} from active review queue`);
      cleanedCount++;
    } else {
      // If it's not review_pending, just report what we found
      console.log(`[clear_test_review_queue] Test job ${job.jobId} has status ${job.status} - leaving as-is`);
    }
  }
  
  if (cleanedCount === 0) {
    console.log("[clear_test_review_queue] No test forced-open review entries found to clean");
  } else {
    console.log(`[clear_test_review_queue] Cleanup complete. Removed ${cleanedCount} test forced-open review entries.`);
  }
  
  return cleanedCount;
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  clearTestReviewQueue().catch(err => {
    console.error("[clear_test_review_queue] Error:", err);
    process.exit(1);
  });
}