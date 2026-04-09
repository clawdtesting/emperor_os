import { strict as assert } from "assert";
import { extractJobFeatures } from "../agent/execution-tier/feature-extractor.js";
import { classifyArchetype } from "../agent/execution-tier/archetype-classifier.js";
import { scoreComplexity } from "../agent/execution-tier/complexity-score.js";
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

test("feature extraction deterministically derives required fields", () => {
  const { features } = extractJobFeatures({
    title: "Write short summary",
    deliverables: [{ id: 1 }],
    acceptanceCriteria: ["contains 200 words"]
  });

  assert.equal(features.deliverableCount, 1);
  assert.equal(features.validationAvailable, true);
  assert.equal(typeof features.iterationRisk, "number");
});

test("archetype classifier marks prime trial correctly", () => {
  const { features } = extractJobFeatures({
    protocolId: "AGIPrime:v1",
    procurementPhase: "TRIAL",
    deliverableCount: 2,
    crossArtifactDependencies: true,
    ambiguityScore: 8,
    externalToolsRequired: 2,
    validationAvailable: true,
    iterationRisk: 7
  });

  const result = classifyArchetype({ protocolId: "AGIPrime:v1", procurementPhase: "TRIAL" }, features);
  assert.equal(result.archetype, "procurement_trial");
});

test("complexity scoring returns interpretable score and reasons", () => {
  const complexity = scoreComplexity({
    deliverableCount: 2,
    crossArtifactDependencies: true,
    ambiguityScore: 7,
    externalToolsRequired: 2,
    validationAvailable: true,
    iterationRisk: 6
  });

  assert.equal(typeof complexity.score, "number");
  assert.equal(Array.isArray(complexity.reasons), true);
  assert.equal(complexity.reasons.length > 0, true);
});

test("tier selection picks T1 for low-complexity job", () => {
  const result = selectExecutionTier({
    title: "Single post",
    description: "Write a deterministic release note",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2
  }, "AGIJobManager:v1");

  assert.equal(result.selectedTier, "T1_ONE_SHOT");
  assert.equal(result.allowed, true);
});

test("tier selection upgrades to T2 when T1 constraints fail", () => {
  const result = selectExecutionTier({
    title: "Structured report",
    deliverableCount: 2,
    crossArtifactDependencies: false,
    ambiguityScore: 5,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 5
  }, "AGIJobManager:v1");

  assert.equal(result.selectedTier, "T2_REPAIR_LOOP");
  assert.deepEqual(result.rejectedTiers[0].tier, "T1_ONE_SHOT");
  assert.equal(result.rejectedTiers[0].reasons.length > 0, true);
});

test("tier selection returns explainable no-fit when allowed tiers insufficient", () => {
  const result = selectExecutionTier({
    title: "Complex multi tool trial",
    deliverableCount: 4,
    crossArtifactDependencies: true,
    ambiguityScore: 8,
    externalToolsRequired: 3,
    validationAvailable: true,
    iterationRisk: 8
  }, "AGIJobManager:v1");

  assert.equal(result.allowed, false);
  assert.equal(result.selectedTier, null);
  assert.equal(result.reason, "no_allowed_tier_satisfies_constraints");
  assert.deepEqual(result.allowedTiers, ["T1_ONE_SHOT", "T2_REPAIR_LOOP"]);
});

test("tier selection can use T3 for AGIPrime when constraints require decomposition", () => {
  const result = selectExecutionTier({
    protocolId: "AGIPrime:v1",
    procurementPhase: "TRIAL",
    title: "Decompose and execute multi-asset trial",
    deliverableCount: 3,
    crossArtifactDependencies: true,
    ambiguityScore: 8,
    externalToolsRequired: 2,
    validationAvailable: true,
    iterationRisk: 7
  }, "AGIPrime:v1");

  assert.equal(result.selectedTier, "T3_PLANNER_EXECUTOR");
  assert.equal(result.archetype.archetype, "procurement_trial");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`execution-tier phase2 checks passed (${passed} tests)`);
