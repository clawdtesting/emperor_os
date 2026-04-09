import { strict as assert } from "assert";
import { executeWithEscalation } from "../agent/execution-tier/runtime-orchestrator.js";
import { createBudgetGuard, enforceValidationGate, isRepairableFailure } from "../agent/execution-tier/runtime-guards.js";

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

test("runtime guard enforces call/token budget", () => {
  const guard = createBudgetGuard({ maxModelCalls: 1, maxTokens: 100 });
  guard.consume(80);
  assert.throws(() => guard.consume(10), /model_call_budget_exceeded/);
});

test("repairability detector flags known repairable codes", () => {
  assert.equal(isRepairableFailure({ passed: false, code: "FORMAT_MISMATCH" }), true);
  assert.equal(isRepairableFailure({ passed: false, code: "UNKNOWN_FAILURE" }), false);
});

test("validation gate blocks finalize when validation failed", () => {
  assert.throws(() => enforceValidationGate({ passed: false }), /validation_gate_failed/);
});

await testAsync("runtime orchestrator completes T1 on first pass", async () => {
  const handlers = {
    generateDraft: async () => ({ output: "draft-v1", tokensUsed: 400 }),
    validate: async () => ({ passed: true, code: "OK" }),
    repair: async () => ({ output: "repair-v1", tokensUsed: 300 }),
    plan: async () => ({ steps: ["s1"], tokensUsed: 300 }),
    executePlanStep: async () => ({ output: "step", tokensUsed: 300 }),
    finalizePlan: async () => ({ output: "final" })
  };

  const result = await executeWithEscalation({
    title: "single deliverable",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2,
    payout: 30,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1", handlers);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.finalTier, "T1_ONE_SHOT");
});

await testAsync("runtime orchestrator escalates T1->T2 and completes", async () => {
  let validateCount = 0;
  const handlers = {
    generateDraft: async () => ({ output: "draft", tokensUsed: 300 }),
    validate: async () => {
      validateCount += 1;
      if (validateCount === 1) {
        return { passed: false, code: "FORMAT_MISMATCH" };
      }
      return { passed: true, code: "OK" };
    },
    repair: async () => ({ output: "repaired", tokensUsed: 300 }),
    plan: async () => ({ steps: ["s1"], tokensUsed: 300 }),
    executePlanStep: async () => ({ output: "step", tokensUsed: 300 }),
    finalizePlan: async () => ({ output: "final" })
  };

  const result = await executeWithEscalation({
    title: "repairable single deliverable",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2,
    payout: 30,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1", handlers);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.finalTier, "T2_REPAIR_LOOP");
});

await testAsync("runtime orchestrator blocks completion when apply gate fails", async () => {
  const handlers = {
    generateDraft: async () => ({ output: "draft", tokensUsed: 300 }),
    validate: async () => ({ passed: true, code: "OK" }),
    repair: async () => ({ output: "repair", tokensUsed: 300 }),
    plan: async () => ({ steps: ["s1"], tokensUsed: 300 }),
    executePlanStep: async () => ({ output: "step", tokensUsed: 300 }),
    finalizePlan: async () => ({ output: "final" })
  };

  const result = await executeWithEscalation({
    title: "unprofitable",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2,
    payout: 0.001,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1", handlers);

  assert.equal(result.status, "NOT_APPLIED");
  assert.equal(result.applyDecision.shouldApply, false);
});

await testAsync("runtime orchestrator fails when escalation not allowed by protocol", async () => {
  const handlers = {
    generateDraft: async () => ({ output: "draft", tokensUsed: 300 }),
    validate: async () => ({ passed: false, code: "FORMAT_MISMATCH" }),
    repair: async () => ({ output: "repair", tokensUsed: 300 }),
    plan: async () => ({ steps: ["s1"], tokensUsed: 300 }),
    executePlanStep: async () => ({ output: "step", tokensUsed: 300 }),
    finalizePlan: async () => ({ output: "final" })
  };

  const result = await executeWithEscalation({
    title: "needs T3 eventually",
    deliverableCount: 2,
    crossArtifactDependencies: false,
    ambiguityScore: 4,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 4,
    payout: 30,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1", handlers);

  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "policy_disallows_escalation");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`execution-tier phase4 checks passed (${passed} tests)`);
