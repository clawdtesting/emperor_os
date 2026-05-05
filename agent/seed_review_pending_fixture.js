// agent/seed_review_pending_fixture.js
// Seeds a fake review_pending job for testing the apply flow.
// This creates a fixture job with ID: fixture_apply_001
// It does not touch MCP, chain, or sign/broadcast anything.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureStateDirs, jobStatePath, writeJson } from "./state.js";
import { ensureJobArtifactDir } from "./artifact-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_JOB_ID = "001"; // Changed to numeric ID
const FIXTURE_VERSIONED_ID = `v1_${FIXTURE_JOB_ID}`; // Using v1 protocol for fixture

async function seedFixture() {
  console.log("[seed_review_pending_fixture] Seeding fixture review_pending job...");
  
  await ensureStateDirs();
  
  // 1. Create job state in review_pending by writing directly to the state file
  const now = new Date().toISOString();
  const fixtureState = {
    jobId: FIXTURE_VERSIONED_ID,
    status: "review_pending",
    operatorTx: {},
    stageIdempotency: {},
    attempts: {
      apply: 0,
      execute: 0,
      submit: 0
    },
    createdAt: now,
    updatedAt: now,
    contractVersion: "v1",
    source: "fixture",
    discoveredAt: now,
    title: "Fixture Job for Apply Testing",
    category: "testing",
    payout: "1000",
    durationSeconds: 86400, // 1 day
    specUri: null,
    details: "This is a fixture job for testing the apply flow. Not a real job.",
    rawJob: {},
    rawSpec: {},
    decision: "accept_candidate",
    score: 0.8,
    scoreReason: "fixture test job",
    reviewedAt: now,
    statusHistory: [
      { status: "review_pending", at: now }
    ],
    artifactDir: path.join(__dirname, "..", "artifacts", `job_${FIXTURE_VERSIONED_ID}`)
  };
  
  const statePath = jobStatePath(FIXTURE_VERSIONED_ID);
  await writeJson(statePath, fixtureState);
  console.log(`[seed_review_pending_fixture] Wrote state for ${FIXTURE_VERSIONED_ID} to ${statePath}`);
  
  // 2. Create artifact directory
  const artifactDir = fixtureState.artifactDir;
  await ensureJobArtifactDir(FIXTURE_VERSIONED_ID); // This ensures the directory exists
  console.log(`[seed_review_pending_fixture] Ensured artifact directory: ${artifactDir}`);
  
  // 3. Create decision.json
  const decision = {
    jobId: FIXTURE_JOB_ID,
    decision: "accept_candidate",
    score: 0.8,
    reason: "fixture test job",
    timestamp: now
  };
  await writeJson(path.join(artifactDir, "decision.json"), decision);
  console.log("[seed_review_pending_fixture] Created decision.json");
  
  // 4. Create discovery_review_packet.json
  const discoveryPacket = {
    jobId: FIXTURE_JOB_ID,
    protocol: "v1",
    source: "fixture",
    rawJobId: FIXTURE_JOB_ID,
    canonicalJobId: FIXTURE_JOB_ID,
    artifacts: {
      specRaw: null,
      specNormalized: { path: "spec.normalized.json", mimeType: "application/json" },
      decision: { path: "decision.json", mimeType: "application/json" }
    },
    generatedAt: now,
    note: "This is a fixture discovery review packet for testing. Not a real job."
  };
  await writeJson(path.join(artifactDir, "discovery_review_packet.json"), discoveryPacket);
  console.log("[seed_review_pending_fixture] Created discovery_review_packet.json");
  
  // 5. Create a minimal spec.normalized.json (required by some paths)
  const specNormalized = {
    properties: {
      title: "Fixture Job for Apply Testing",
      category: "testing",
      details: "This is a fixture job for testing the apply flow. Not a real job."
    }
  };
  await writeJson(path.join(artifactDir, "spec.normalized.json"), specNormalized);
  console.log("[seed_review_pending_fixture] Created spec.normalized.json");
  
  console.log("[seed_review_pending_fixture] Fixture seeding complete.");
  console.log(`[seed_review_pending_fixture] You can now run:`);
  console.log(`  node agent/list_review_queue.js`);
  console.log(`  node agent/approve_for_apply.js ${FIXTURE_JOB_ID}`);
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedFixture().catch(err => {
    console.error("[seed_review_pending_fixture] Error:", err);
    process.exit(1);
  });
}