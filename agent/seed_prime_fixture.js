// agent/seed_prime_fixture.js
// Seeds a fake Prime procurement for testing the Prime state machine.
// This creates a fixture procurement with ID: 1001
// It does not touch MCP, chain, or sign/broadcast anything.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import { emptyProcState, writeJson, ensureDir } from "./prime-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PROCUREMENT_ID = "1001";

async function seedFixture() {
  console.log("[seed_prime_fixture] Seeding fixture Prime procurement...");
  
  const procRoot = path.join(CONFIG.WORKSPACE_ROOT, "artifacts", `proc_${FIXTURE_PROCUREMENT_ID}`);
  await ensureDir(procRoot);
  
  // 1. Create Prime state for procurement 1001 - set to APPLICATION_DRAFTED so we can build commit package
  const now = new Date().toISOString();
  const fixtureState = emptyProcState(FIXTURE_PROCUREMENT_ID, null);
  fixtureState.status = "APPLICATION_DRAFTED"; // Ready to build commit package
  fixtureState.createdAt = now;
  fixtureState.updatedAt = now;
  
  const statePath = path.join(procRoot, "state.json");
  await writeJson(statePath, fixtureState);
  console.log(`[seed_prime_fixture] Wrote state for procurement ${FIXTURE_PROCUREMENT_ID} to ${statePath}`);
  
  // 2. Create prime_procurement_snapshot.json
  const snapshot = {
    procurementId: FIXTURE_PROCUREMENT_ID,
    title: "Fixture Prime Procurement for Testing",
    description: "This is a fixture Prime procurement for testing the state machine. Not a real procurement.",
    discoveredAt: now,
    chainId: 1,
    contractAddress: "0xd5EF1dde7Ac60488f697ff2A7967a52172A78F29",
    commitDeadline: String(Math.floor(Date.now() / 1000) + 86400 * 7), // 7 days from now
    revealDeadline: String(Math.floor(Date.now() / 1000) + 86400 * 14), // 14 days from now
    finalistAcceptDeadline: String(Math.floor(Date.now() / 1000) + 86400 * 21), // 21 days from now
    trialDeadline: String(Math.floor(Date.now() / 1000) + 86400 * 28), // 28 days from now
    scoreCommitDeadline: String(Math.floor(Date.now() / 1000) + 86400 * 35), // 35 days from now
    scoreRevealDeadline: String(Math.floor(Date.now() / 1000) + 86400 * 42), // 42 days from now
    generatedAt: now,
    note: "This is a fixture procurement snapshot for testing. Not real chain data."
  };
  
  const snapshotPath = path.join(procRoot, "prime_procurement_snapshot.json");
  await writeJson(snapshotPath, snapshot);
  console.log("[seed_prime_fixture] Created prime_procurement_snapshot.json");
  
  // 3. Create prime_discovery_review_packet.json
  const discoveryPacket = {
    procurementId: FIXTURE_PROCUREMENT_ID,
    source: "fixture",
    rawProcurementId: FIXTURE_PROCUREMENT_ID,
    canonicalProcurementId: FIXTURE_PROCUREMENT_ID,
    artifacts: {
      snapshot: { path: "prime_procurement_snapshot.json", mimeType: "application/json" }
    },
    generatedAt: now,
    note: "This is a fixture discovery review packet for testing. Not a real procurement."
  };
  
  const discoveryPacketPath = path.join(procRoot, "prime_discovery_review_packet.json");
  await writeJson(discoveryPacketPath, discoveryPacket);
  console.log("[seed_prime_fixture] Created prime_discovery_review_packet.json");
  
  // 4. Create required artifact directories and files for commit action
  const appDir = path.join(procRoot, "application");
  await ensureDir(appDir);
  
  // application_brief.md
  const applicationBrief = "# Fixture Application Brief\n\nThis is a fixture application brief for testing.";
  await fs.writeFile(path.join(appDir, "application_brief.md"), applicationBrief, "utf8");
  console.log("[seed_prime_fixture] Created application/application_brief.md");
  
  // application_payload.json
  const applicationPayload = {
    applicationURI: "ipfs://bafybeih5d6o6w6l7k3m2n1o0p9z8x7v6u5t4s3r2q1p0o9n8m7l6k5j4i3h2g1f0e",
    // other fields can be added as needed
  };
  await fs.writeFile(path.join(appDir, "application_payload.json"), JSON.stringify(applicationPayload, null, 2), "utf8");
  console.log("[seed_prime_fixture] Created application/application_payload.json");
  
  // commitment_material.json
  const commitmentMaterial = {
    commitmentHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    agentSubdomain: "fixture-agent",
    merkleProof: ["0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"],
    salt: "0xsalt1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab"
  };
  await fs.writeFile(path.join(appDir, "commitment_material.json"), JSON.stringify(commitmentMaterial, null, 2), "utf8");
  console.log("[seed_prime_fixture] Created application/commitment_material.json");
  
  // 5. Create inspection directory and fit_evaluation.json (required by prime-review-gates.js for COMMIT_GATE)
  const inspectionDir = path.join(procRoot, "inspection");
  await ensureDir(inspectionDir);
  
  const fitEvaluation = {
    decision: "PASS",
    notes: "Fixture fit evaluation passed.",
    evaluatedAt: now
  };
  await fs.writeFile(path.join(inspectionDir, "fit_evaluation.json"), JSON.stringify(fitEvaluation, null, 2), "utf8");
  console.log("[seed_prime_fixture] Created inspection/fit_evaluation.json");
  
  // 6. Create directories for reveal, finalist, trial
  await ensureDir(path.join(procRoot, "reveal"));
  await ensureDir(path.join(procRoot, "finalist"));
  const trialDir = path.join(procRoot, "trial");
  await ensureDir(trialDir);

  // Seed deterministic trial fixture artifacts so submit-trial can be packaged
  const trialManifest = { files: ["trial_result.md"], generatedAt: now };
  await fs.writeFile(path.join(trialDir, "trial_artifact_manifest.json"), JSON.stringify(trialManifest, null, 2), "utf8");
  const trialPublication = { trialURI: "ipfs://fixture-trial-uri", publishedAt: now };
  await fs.writeFile(path.join(trialDir, "publication_record.json"), JSON.stringify(trialPublication, null, 2), "utf8");
  const trialFetchback = { verified: true, checkedAt: now };
  await fs.writeFile(path.join(trialDir, "fetchback_verification.json"), JSON.stringify(trialFetchback, null, 2), "utf8");
  
  console.log("[seed_prime_fixture] Fixture seeding complete.");
  console.log(`[seed_prime_fixture] You can now run:`);
  console.log(`  node agent/prime_approve_action.js ${FIXTURE_PROCUREMENT_ID} commit`);
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedFixture().catch(err => {
    console.error("[seed_prime_fixture] Error:", err);
    process.exit(1);
  });
}