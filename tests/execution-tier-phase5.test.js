import { strict as assert } from "assert";
import { promises as fs } from "fs";
import {
  advanceExecutionStage,
  getExecutionTierPaths,
  initExecutionState,
  loadExecutionState,
  writeExecutionPass,
  writeStageArtifact
} from "../agent/execution-tier/state-machine.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error.message);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error.message);
  }
}

const jobId = `phase5_${Date.now()}`;

await testAsync("state machine initializes discover state and persists state file", async () => {
  const initial = await initExecutionState(jobId, { source: "phase5-test" });
  assert.equal(initial.currentStage, "discover");

  const paths = getExecutionTierPaths(jobId);
  const raw = await fs.readFile(paths.state, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.currentStage, "discover");
});

await testAsync("state machine enforces valid transition order", async () => {
  await advanceExecutionStage(jobId, "normalize");
  const current = await loadExecutionState(jobId);
  assert.equal(current.currentStage, "normalize");
});

await testAsync("state machine blocks stage advance when required artifact missing", async () => {
  await advanceExecutionStage(jobId, "classify");
  await assert.rejects(
    () => advanceExecutionStage(jobId, "tier_selection"),
    /missing_required_artifact:tier_selection:tier_selection.json/
  );
});

await testAsync("tier selection artifact schema is validated before stage advance", async () => {
  await writeStageArtifact(jobId, "tier_selection.json", {
    selectedTier: "T2_REPAIR_LOOP",
    complexityFeatures: {
      deliverableCount: 2,
      crossArtifactDependencies: false,
      ambiguityScore: 4,
      externalToolsRequired: 0,
      validationAvailable: true,
      iterationRisk: 4
    },
    economicCheck: { payoutUsd: 30, executionCostUsd: 3 },
    reasoning: ["T1 rejected due to ambiguity"]
  });

  const advanced = await advanceExecutionStage(jobId, "tier_selection");
  assert.equal(advanced.currentStage, "tier_selection");
});

await testAsync("economic/apply/validation artifacts gate stage progression", async () => {
  await writeStageArtifact(jobId, "economic_check.json", {
    payoutUsd: 30,
    executionCostUsd: 5,
    passes: true
  });
  await advanceExecutionStage(jobId, "economic_check");

  await writeStageArtifact(jobId, "apply_decision.json", {
    shouldApply: true,
    rejectionReasons: []
  });
  await advanceExecutionStage(jobId, "apply_decision");
  await advanceExecutionStage(jobId, "apply");
  await advanceExecutionStage(jobId, "execute_pass_1");

  await writeStageArtifact(jobId, "validation.json", {
    passed: true,
    code: "OK"
  });
  await advanceExecutionStage(jobId, "validate");

  await writeStageArtifact(jobId, "repair_logs.json", {
    passes: []
  });
  const finalized = await advanceExecutionStage(jobId, "finalize");
  assert.equal(finalized.currentStage, "finalize");
});

await testAsync("signing boundary is enforced on stage artifacts and pass artifacts", async () => {
  await assert.rejects(
    () => writeStageArtifact(jobId, "economic_check.json", { privateKey: "0xabc" }),
    /signing_boundary_violation:privatekey/
  );

  await assert.rejects(
    () => writeExecutionPass(jobId, 2, { signedTx: "0x123" }),
    /signing_boundary_violation:signedtx/
  );

  const passPath = await writeExecutionPass(jobId, 1, { output: "draft", validation: "pending" });
  const exists = await fs.readFile(passPath, "utf8");
  assert.equal(Boolean(JSON.parse(exists).output), true);
});

await testAsync("state machine can reach submit after finalize", async () => {
  const submitted = await advanceExecutionStage(jobId, "submit");
  assert.equal(submitted.currentStage, "submit");
});

test("phase5 test harness reached assertions", () => {
  assert.equal(passed > 0, true);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`execution-tier phase5 checks passed (${passed} tests)`);
