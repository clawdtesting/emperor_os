import { strict as assert } from "assert";
import {
  assertExecutionTierAllowed,
  canEscalateTier,
  getAllowedExecutionTiers,
  getArchetypeDefaultTier,
  getEscalationPolicy,
  getTierRule,
  validateJobFeatures
} from "../agent/execution-tier/policy-engine.js";

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

test("protocol policy: AGIJobManager:v1 allows T1/T2 only", () => {
  const tiers = getAllowedExecutionTiers("AGIJobManager:v1");
  assert.deepEqual(tiers, ["T1_ONE_SHOT", "T2_REPAIR_LOOP"]);
});

test("protocol policy enforcement rejects disallowed tier", () => {
  assert.throws(
    () => assertExecutionTierAllowed("AGIJobManager:v1", "T3_PLANNER_EXECUTOR"),
    /Disallowed execution tier/
  );
});

test("job feature schema accepts valid feature object", () => {
  const validFeatures = {
    deliverableCount: 2,
    crossArtifactDependencies: false,
    ambiguityScore: 4,
    externalToolsRequired: 1,
    validationAvailable: true,
    iterationRisk: 5
  };

  assert.equal(validateJobFeatures(validFeatures), true);
});

test("job feature schema rejects missing required field", () => {
  assert.throws(
    () => validateJobFeatures({ deliverableCount: 1 }),
    /Missing job feature/
  );
});

test("archetype taxonomy exposes defaults", () => {
  assert.equal(getArchetypeDefaultTier("simple_content"), "T1_ONE_SHOT");
  assert.equal(getArchetypeDefaultTier("multi_file_build"), "T3_PLANNER_EXECUTOR");
});

test("tier rule schema is data-backed and queryable", () => {
  const t2 = getTierRule("T2_REPAIR_LOOP");
  assert.equal(t2.maxModelCalls, 3);
  assert.equal(t2.constraints.validationAvailableRequired, true);
});

test("escalation policy allows T1→T2 within bounds", () => {
  assert.equal(canEscalateTier("T1_ONE_SHOT", "T2_REPAIR_LOOP", 0, "AGIPrime:v1"), true);
});

test("escalation policy blocks disallowed path and budget overflow", () => {
  assert.equal(canEscalateTier("T1_ONE_SHOT", "T3_PLANNER_EXECUTOR", 0, "AGIPrime:v1"), false);
  assert.equal(canEscalateTier("T1_ONE_SHOT", "T2_REPAIR_LOOP", 1, "AGIPrime:v1"), false);
});

test("escalation policy is explicit", () => {
  const escalationPolicy = getEscalationPolicy();
  assert.equal(escalationPolicy.enabled, true);
  assert.equal(escalationPolicy.maxEscalations, 1);
  assert.deepEqual(escalationPolicy.allowedPaths, [
    ["T1_ONE_SHOT", "T2_REPAIR_LOOP"],
    ["T2_REPAIR_LOOP", "T3_PLANNER_EXECUTOR"]
  ]);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`execution-tier phase1 checks passed (${passed} tests)`);
