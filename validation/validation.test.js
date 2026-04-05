// validation/validation.test.js
// Comprehensive tests for the validator role lifecycle branch.
//
// Tests cover:
//   - Scoring adjudicator (deterministic evaluation)
//   - Multi-validator coordination (aggregation, collusion detection)
//   - Dispute resolution (detection, lifecycle, state transitions)
//   - Lifecycle branch (state machine, transitions, mapping)
//   - Config validation
//
// Run: node validation/validation.test.js

import { strict as assert } from "assert";
import {
  adjudicateScore,
  computeScoreCommitment,
  verifyScoreReveal,
} from "./scoring-adjudicator.js";
import {
  aggregateScores,
  detectCollusionPatterns,
  computeConsensusDecision,
  computeValidatorReputation,
} from "./multi-validator-coord.js";
import {
  detectDisputes,
  buildDisputeReviewPacket,
  DISPUTE_STATUS,
} from "./dispute-resolver.js";
import {
  VALIDATOR_LIFECYCLE,
  isValidValidatorTransition,
  assertValidValidatorTransition,
  getValidatorNextAction,
  mapValidatorLifecycleToProcStatus,
  isValidatorHandoffStatus,
} from "./lifecycle-branch.js";
import { PROC_STATUS } from "../agent/prime-phase-model.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(`  ${err.message}`);
  }
}

// ── Scoring Adjudicator Tests ─────────────────────────────────────────────────

test("computeScoreCommitment produces deterministic hash", () => {
  const c1 = computeScoreCommitment(75, "0xabc123");
  const c2 = computeScoreCommitment(75, "0xabc123");
  assert.strictEqual(c1, c2);
  assert.ok(c1.startsWith("0x"));
  assert.strictEqual(c1.length, 66);
});

test("computeScoreCommitment differs for different scores", () => {
  const c1 = computeScoreCommitment(75, "0xabc123");
  const c2 = computeScoreCommitment(80, "0xabc123");
  assert.notStrictEqual(c1, c2);
});

test("computeScoreCommitment differs for different salts", () => {
  const c1 = computeScoreCommitment(75, "0xabc123");
  const c2 = computeScoreCommitment(75, "0xdef456");
  assert.notStrictEqual(c1, c2);
});

test("verifyScoreReveal passes with correct inputs", () => {
  const score = 75;
  const salt = "0xabc123";
  const commitment = computeScoreCommitment(score, salt);
  const result = verifyScoreReveal({ score, salt, expectedCommitment: commitment });
  assert.strictEqual(result.verified, true);
});

test("verifyScoreReveal fails with wrong score", () => {
  const salt = "0xabc123";
  const commitment = computeScoreCommitment(75, salt);
  const result = verifyScoreReveal({ score: 80, salt, expectedCommitment: commitment });
  assert.strictEqual(result.verified, false);
});

test("verifyScoreReveal fails with wrong salt", () => {
  const commitment = computeScoreCommitment(75, "0xabc123");
  const result = verifyScoreReveal({ score: 75, salt: "0xdef456", expectedCommitment: commitment });
  assert.strictEqual(result.verified, false);
});

test("adjudicateScore returns structured result", () => {
  const evidence = {
    procurement: {
      procStruct: { jobId: "123" },
      deadlines: { trial: Date.now() / 1000 + 3600, scoreCommit: Date.now() / 1000 + 7200 },
      isScorePhase: true,
    },
    trial: {
      trialSubmissions: [{
        submitter: "0xabc",
        trialURI: "ipfs://QmTest123",
        cid: "QmTest123",
        content: "## Introduction\n\nThis is a substantive trial deliverable with proper structure.\n\n## Analysis\n\nDetailed analysis follows.\n\n### Findings\n\n- Finding one\n- Finding two\n\n## Conclusion\n\nThe trial demonstrates the approach effectively.\n\n```javascript\nconst x = 1;\n```\n",
        contentLength: 250,
      }],
    },
  };
  const content = evidence.trial.trialSubmissions[0].content;
  const result = adjudicateScore(evidence, content);

  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(result.dimensions.specCompliance);
  assert.ok(result.dimensions.artifactQuality);
  assert.ok(result.dimensions.publicVerifiability);
  assert.ok(result.dimensions.deadlineAdherence);
  assert.ok(result.dimensions.reuseValue);
  assert.strictEqual(result.schema, "emperor-os/validator-adjudication/v1");
});

test("adjudicateScore handles empty content", () => {
  const evidence = { procurement: { procStruct: {} }, trial: { trialSubmissions: [] } };
  const result = adjudicateScore(evidence, "");
  assert.ok(result.score >= 0 && result.score <= 100);
});

test("adjudicateScore handles null content", () => {
  const evidence = { procurement: { procStruct: {} }, trial: { trialSubmissions: [] } };
  const result = adjudicateScore(evidence, null);
  assert.ok(result.score >= 0 && result.score <= 100);
});

// ── Multi-Validator Coordination Tests ────────────────────────────────────────

test("aggregateScores computes mean correctly", () => {
  const scores = [
    { validator: "0x1", score: 70 },
    { validator: "0x2", score: 80 },
    { validator: "0x3", score: 90 },
  ];
  const result = aggregateScores(scores, "mean");
  assert.strictEqual(result.aggregated, 80);
  assert.strictEqual(result.method, "mean");
  assert.strictEqual(result.count, 3);
});

test("aggregateScores computes median correctly", () => {
  const scores = [
    { validator: "0x1", score: 10 },
    { validator: "0x2", score: 50 },
    { validator: "0x3", score: 90 },
  ];
  const result = aggregateScores(scores, "median");
  assert.strictEqual(result.aggregated, 50);
});

test("aggregateScores handles empty input", () => {
  const result = aggregateScores([], "mean");
  assert.strictEqual(result.aggregated, null);
  assert.strictEqual(result.count, 0);
});

test("aggregateScores handles null scores", () => {
  const scores = [
    { validator: "0x1", score: null },
    { validator: "0x2", score: 80 },
  ];
  const result = aggregateScores(scores, "mean");
  assert.strictEqual(result.aggregated, 80);
  assert.strictEqual(result.count, 1);
});

test("detectCollusionPatterns detects identical scores", () => {
  const scores = [
    { validator: "0x1", score: 90 },
    { validator: "0x2", score: 90 },
    { validator: "0x3", score: 50 },
  ];
  const result = detectCollusionPatterns(scores);
  assert.ok(result.patterns.some(p => p.type === "identical_scores"));
});

test("detectCollusionPatterns returns empty when no collusion", () => {
  const scores = [
    { validator: "0x1", score: 30 },
    { validator: "0x2", score: 50 },
    { validator: "0x3", score: 70 },
  ];
  const result = detectCollusionPatterns(scores);
  assert.ok(result.patterns.length === 0 || !result.patterns.some(p => p.type === "identical_scores"));
});

test("detectCollusionPatterns disabled when config says so", () => {
  const scores = [
    { validator: "0x1", score: 90 },
    { validator: "0x2", score: 90 },
  ];
  const original = process.env.VALIDATOR_COLLUSION_DETECTION;
  process.env.VALIDATOR_COLLUSION_DETECTION = "false";

  const result = detectCollusionPatterns(scores);
  assert.strictEqual(result.enabled, false);

  process.env.VALIDATOR_COLLUSION_DETECTION = original;
});

test("computeConsensusDecision returns winner", () => {
  const scores = [
    { validator: "0xagent1", score: 85 },
    { validator: "0xagent2", score: 60 },
    { validator: "0xagent3", score: 70 },
  ];
  const result = computeConsensusDecision(scores, ["0xagent1", "0xagent2", "0xagent3"]);
  assert.ok(result.winner);
  assert.ok(result.applicantRanking.length > 0);
  assert.strictEqual(result.schema, "emperor-os/validator-consensus/v1");
});

test("computeValidatorReputation computes from history", () => {
  const result = computeValidatorReputation("0xValidator1", [70, 72, 68, 71, 69]);
  assert.ok(result.reputation >= 0 && result.reputation <= 1);
  assert.strictEqual(result.totalEvaluations, 5);
});

test("computeValidatorReputation handles no history", () => {
  const result = computeValidatorReputation("0xValidator1", []);
  assert.strictEqual(result.reputation, 0.5);
  assert.strictEqual(result.totalEvaluations, 0);
});

// ── Dispute Resolution Tests ──────────────────────────────────────────────────

test("detectDisputes finds large score deltas", () => {
  const scores = [
    { validator: "0x1", score: 20 },
    { validator: "0x2", score: 80 },
  ];
  const result = detectDisputes(scores, 25);
  assert.ok(result.detected);
  assert.strictEqual(result.disputes.length, 1);
  assert.strictEqual(result.disputes[0].delta, 60);
});

test("detectDisputes finds no disputes when scores are close", () => {
  const scores = [
    { validator: "0x1", score: 70 },
    { validator: "0x2", score: 75 },
  ];
  const result = detectDisputes(scores, 25);
  assert.ok(!result.detected);
  assert.strictEqual(result.disputes.length, 0);
});

test("detectDisputes handles empty input", () => {
  const result = detectDisputes([], 25);
  assert.ok(!result.detected);
});

test("detectDisputes handles single validator", () => {
  const result = detectDisputes([{ validator: "0x1", score: 70 }], 25);
  assert.ok(!result.detected);
});

test("buildDisputeReviewPacket produces structured output", () => {
  const dispute = {
    disputeId: "test-dispute-1",
    procurementId: "42",
    status: DISPUTE_STATUS.PROPOSED,
    validatorA: "0x1",
    validatorB: "0x2",
    scoreA: 20,
    scoreB: 80,
    delta: 60,
    evidence: null,
    timeline: [{ event: "PROPOSED", at: new Date().toISOString() }],
    deadline: new Date(Date.now() + 86400000).toISOString(),
    resolution: null,
    generatedAt: new Date().toISOString(),
  };
  const packet = buildDisputeReviewPacket(dispute);
  assert.strictEqual(packet.schema, "emperor-os/dispute-review-packet/v1");
  assert.strictEqual(packet.disputeId, "test-dispute-1");
  assert.ok(packet.reviewChecklist.length > 0);
});

// ── Lifecycle Branch Tests ────────────────────────────────────────────────────

test("isValidValidatorTransition allows valid transitions", () => {
  assert.ok(isValidValidatorTransition(VALIDATOR_LIFECYCLE.IDLE, VALIDATOR_LIFECYCLE.DISCOVERED));
  assert.ok(isValidValidatorTransition(VALIDATOR_LIFECYCLE.DISCOVERED, VALIDATOR_LIFECYCLE.EVALUATING));
  assert.ok(isValidValidatorTransition(VALIDATOR_LIFECYCLE.EVALUATING, VALIDATOR_LIFECYCLE.COMMIT_READY));
  assert.ok(isValidValidatorTransition(VALIDATOR_LIFECYCLE.COMMIT_READY, VALIDATOR_LIFECYCLE.COMMIT_SUBMITTED));
  assert.ok(isValidValidatorTransition(VALIDATOR_LIFECYCLE.COMMIT_SUBMITTED, VALIDATOR_LIFECYCLE.REVEAL_READY));
  assert.ok(isValidValidatorTransition(VALIDATOR_LIFECYCLE.REVEAL_READY, VALIDATOR_LIFECYCLE.REVEAL_SUBMITTED));
  assert.ok(isValidValidatorTransition(VALIDATOR_LIFECYCLE.REVEAL_SUBMITTED, VALIDATOR_LIFECYCLE.SETTLED));
});

test("isValidValidatorTransition rejects invalid transitions", () => {
  assert.ok(!isValidValidatorTransition(VALIDATOR_LIFECYCLE.IDLE, VALIDATOR_LIFECYCLE.SETTLED));
  assert.ok(!isValidValidatorTransition(VALIDATOR_LIFECYCLE.SETTLED, VALIDATOR_LIFECYCLE.IDLE));
  assert.ok(!isValidValidatorTransition(VALIDATOR_LIFECYCLE.COMMIT_READY, VALIDATOR_LIFECYCLE.REVEAL_READY));
});

test("assertValidValidatorTransition throws on invalid transition", () => {
  assert.throws(
    () => assertValidValidatorTransition(VALIDATOR_LIFECYCLE.IDLE, VALIDATOR_LIFECYCLE.SETTLED),
    /Invalid validator transition/
  );
});

test("assertValidValidatorTransition does not throw on valid transition", () => {
  assert.doesNotThrow(
    () => assertValidValidatorTransition(VALIDATOR_LIFECYCLE.IDLE, VALIDATOR_LIFECYCLE.DISCOVERED)
  );
});

test("getValidatorNextAction returns correct actions", () => {
  const idle = getValidatorNextAction(VALIDATOR_LIFECYCLE.IDLE);
  assert.strictEqual(idle.action, "CHECK_ASSIGNMENT");

  const commitReady = getValidatorNextAction(VALIDATOR_LIFECYCLE.COMMIT_READY);
  assert.strictEqual(commitReady.action, "NONE");
  assert.ok(commitReady.blockedReason);

  const revealReady = getValidatorNextAction(VALIDATOR_LIFECYCLE.REVEAL_READY);
  assert.strictEqual(revealReady.action, "NONE");
  assert.ok(revealReady.blockedReason);

  const settled = getValidatorNextAction(VALIDATOR_LIFECYCLE.SETTLED);
  assert.strictEqual(settled.action, "RECONCILE");
});

test("mapValidatorLifecycleToProcStatus maps correctly", () => {
  assert.strictEqual(
    mapValidatorLifecycleToProcStatus(VALIDATOR_LIFECYCLE.COMMIT_READY),
    PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY
  );
  assert.strictEqual(
    mapValidatorLifecycleToProcStatus(VALIDATOR_LIFECYCLE.REVEAL_READY),
    PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY
  );
  assert.strictEqual(
    mapValidatorLifecycleToProcStatus(VALIDATOR_LIFECYCLE.IDLE),
    null
  );
});

test("isValidatorHandoffStatus identifies handoff states", () => {
  assert.ok(isValidatorHandoffStatus(PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY));
  assert.ok(isValidatorHandoffStatus(PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY));
  assert.ok(!isValidatorHandoffStatus(PROC_STATUS.COMMIT_READY));
  assert.ok(!isValidatorHandoffStatus(PROC_STATUS.DISCOVERED));
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n══ Validator Test Results ═══════════════════════════════`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log(`══════════════════════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
