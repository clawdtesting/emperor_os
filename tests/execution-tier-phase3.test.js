import { strict as assert } from "assert";
import { estimateExecutionCost, evaluateMargin, normalizePayoutToUsd } from "../agent/execution-tier/economics.js";
import { shouldApply } from "../agent/execution-tier/apply-gate.js";

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

test("economics: payout normalization supports USD and AGIALPHA", () => {
  const usd = normalizePayoutToUsd({ payout: 100, payoutCurrency: "USD" });
  assert.equal(usd.payoutUsd, 100);

  const alpha = normalizePayoutToUsd({ payout: 50, payoutCurrency: "AGIALPHA" }, { agiAlphaToUsd: 2 });
  assert.equal(alpha.payoutUsd, 100);
});

test("economics: margin policy enforces >= 1.25x", () => {
  const pass = evaluateMargin(12.5, 10, 1.25);
  assert.equal(pass.passes, true);

  const fail = evaluateMargin(12.49, 10, 1.25);
  assert.equal(fail.passes, false);
});

test("economics: execution cost estimate is deterministic and structured", () => {
  const estimate = estimateExecutionCost(
    { title: "job" },
    "T2_REPAIR_LOOP",
    { score: 50 },
    { usdPer1kTokens: 0.01 }
  );

  assert.equal(typeof estimate.modelCalls, "number");
  assert.equal(typeof estimate.tokens, "number");
  assert.equal(typeof estimate.usdCost, "number");
  assert.equal(typeof estimate.wallClockTime, "number");
});

test("apply gate: accepts feasible profitable verifiable job", () => {
  const decision = shouldApply({
    title: "Structured report",
    description: "Generate report with clear rubric",
    deliverableCount: 2,
    crossArtifactDependencies: false,
    ambiguityScore: 4,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 4,
    payout: 30,
    payoutCurrency: "USD",
    confidenceScore: 0.8
  }, "AGIJobManager:v1", {
    gatePolicy: { marginMultiplier: 1.25, minConfidence: 0.6 }
  });

  assert.equal(decision.shouldApply, true);
  assert.equal(decision.rejectionReasons.length, 0);
});

test("apply gate: rejects when no feasible tier under protocol limits", () => {
  const decision = shouldApply({
    title: "Complex multi-tool trial",
    deliverableCount: 4,
    crossArtifactDependencies: true,
    ambiguityScore: 8,
    externalToolsRequired: 3,
    validationAvailable: true,
    iterationRisk: 8,
    payout: 100,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1");

  assert.equal(decision.shouldApply, false);
  assert.equal(decision.rejectionReasons.includes("execution_not_feasible_under_allowed_tiers"), true);
});

test("apply gate: rejects negative-margin jobs", () => {
  const decision = shouldApply({
    title: "Small payout job",
    deliverableCount: 2,
    crossArtifactDependencies: false,
    ambiguityScore: 4,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 4,
    payout: 0.01,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1");

  assert.equal(decision.shouldApply, false);
  assert.equal(decision.rejectionReasons.includes("fails_margin_policy"), true);
});

test("apply gate: rejects when validation feasibility fails", () => {
  const decision = shouldApply({
    title: "No validation path",
    deliverableCount: 2,
    crossArtifactDependencies: false,
    ambiguityScore: 4,
    externalToolsRequired: 0,
    validationAvailable: false,
    iterationRisk: 4,
    payout: 50,
    payoutCurrency: "USD",
    confidenceScore: 0.9
  }, "AGIJobManager:v1");

  assert.equal(decision.shouldApply, false);
  assert.equal(decision.rejectionReasons.includes("validation_not_feasible"), true);
});

test("apply gate: rejects low confidence jobs", () => {
  const decision = shouldApply({
    title: "Low confidence job",
    deliverableCount: 1,
    crossArtifactDependencies: false,
    ambiguityScore: 2,
    externalToolsRequired: 0,
    validationAvailable: true,
    iterationRisk: 2,
    payout: 50,
    payoutCurrency: "USD",
    confidenceScore: 0.2
  }, "AGIJobManager:v1", {
    gatePolicy: { minConfidence: 0.6 }
  });

  assert.equal(decision.shouldApply, false);
  assert.equal(decision.rejectionReasons.includes("confidence_below_threshold"), true);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`execution-tier phase3 checks passed (${passed} tests)`);
