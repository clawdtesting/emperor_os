import { strict as assert } from "assert";
import { assertExecutionTierAllowed } from "../agent/execution-tier/policy-engine.js";
import { createBudgetGuard, enforceValidationGate } from "../agent/execution-tier/runtime-guards.js";
import { createRolloutController, ROLLOUT_MODES } from "../agent/execution-tier/rollout.js";
import { selectExecutionTier } from "../agent/execution-tier/tier-selector.js";

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

test("invariant: never select disallowed tier for protocol", () => {
  const selection = selectExecutionTier({
    title: "simple task",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2
  }, "AGIJobManager:v1");

  assert.equal(selection.selectedTier, "T1_ONE_SHOT");
  assert.equal(assertExecutionTierAllowed("AGIJobManager:v1", selection.selectedTier), true);
  assert.throws(() => assertExecutionTierAllowed("AGIJobManager:v1", "T3_PLANNER_EXECUTOR"), /Disallowed execution tier/);
});

test("invariant: budget guard prevents model/token overflow", () => {
  const guard = createBudgetGuard({ maxModelCalls: 2, maxTokens: 500 });
  guard.consume(200);
  guard.consume(250);
  assert.throws(() => guard.consume(10), /model_call_budget_exceeded/);
});

test("invariant: cannot submit/finalize without successful validation", () => {
  assert.throws(() => enforceValidationGate({ passed: false }), /validation_gate_failed/);
  assert.equal(enforceValidationGate({ passed: true }), true);
});

test("rollout: dry-run mode never actually applies", () => {
  const controller = createRolloutController({ mode: ROLLOUT_MODES.DRY_RUN });
  const result = controller.evaluate({
    jobId: "dry-1",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2,
    payout: 50,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1");

  assert.equal(result.mode, "dry_run");
  assert.equal(result.shouldApply, false);
  assert.equal(result.simulated, true);
});

test("rollout: shadow mode records decisions and reason telemetry", () => {
  const controller = createRolloutController({ mode: ROLLOUT_MODES.SHADOW });
  controller.evaluate({
    jobId: "shadow-pass",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2,
    payout: 50,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1");

  controller.evaluate({
    jobId: "shadow-fail",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2,
    payout: 0.0001,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1");

  const telemetry = controller.snapshot();
  assert.equal(telemetry.totalEvaluated, 2);
  assert.equal(telemetry.appliesAllowed, 1);
  assert.equal(telemetry.appliesBlocked, 1);
  assert.equal(telemetry.rejectionReasonCounts.fails_margin_policy, 1);
});

test("rollout: enforce mode follows shouldApply decision", () => {
  const controller = createRolloutController({ mode: ROLLOUT_MODES.ENFORCE });
  const result = controller.evaluate({
    jobId: "enforce-1",
    deliverableCount: 2,
    crossArtifactDependencies: false,
    ambiguityScore: 4,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 4,
    payout: 30,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1");

  assert.equal(result.mode, "enforce");
  assert.equal(result.enforce, true);
  assert.equal(typeof result.shouldApply, "boolean");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`execution-tier phase6 checks passed (${passed} tests)`);
