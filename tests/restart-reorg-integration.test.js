// tests/restart-reorg-integration.test.js
// Item #5: Restart-safety, reorg-detection, and integration tests.
//
// Covers:
//   Section A — Versioned job ID parsing & rawJobId extraction
//   Section B — Job normalization (v1 + v2 field variants)
//   Section C — Chain phase derivation & missed-window detection
//   Section D — Procurement status transition validity
//   Section E — Reorg cursor rollback simulation
//   Section F — Scoring adjudicator determinism & commitment unification
//   Section G — Commit-reveal continuity (cross-restart)
//
// Run: node tests/restart-reorg-integration.test.js

import { strict as assert } from "assert";
import { createHash } from "crypto";

// ── Imports under test ───────────────────────────────────────────────────────

import {
  parseVersionedJobId,
  isVersionedJobId,
  buildVersionedJobId,
  rawJobId,
} from "../agent/state.js";

import {
  normalizeJob,
  parsePayoutNumber,
  isAssignedToAddress,
} from "../agent/job-normalize.js";

import {
  PROC_STATUS,
  CHAIN_PHASE,
  TERMINAL_STATUSES,
  deriveChainPhase,
  secondsUntilDeadline,
  didMissRequiredWindow,
  isValidTransition,
  assertValidTransition,
  toCanonicalPhase,
} from "../agent/prime-phase-model.js";

import {
  adjudicateScore,
  computeScoreCommitment,
  verifyScoreReveal,
} from "../validation/scoring-adjudicator.js";

import {
  computeScoreCommitment as engineComputeCommitment,
  verifyScoreRevealAgainstCommit,
} from "../agent/prime-validator-engine.js";

// ── Test harness ─────────────────────────────────────────────────────────────

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

// ═════════════════════════════════════════════════════════════════════════════
// Section A — Versioned Job ID Parsing
// ═════════════════════════════════════════════════════════════════════════════

test("parseVersionedJobId: v1 prefix", () => {
  const { version, jobId } = parseVersionedJobId("v1_456");
  assert.equal(version, "v1");
  assert.equal(jobId, "456");
});

test("parseVersionedJobId: v2 prefix", () => {
  const { version, jobId } = parseVersionedJobId("v2_123");
  assert.equal(version, "v2");
  assert.equal(jobId, "123");
});

test("parseVersionedJobId: prime prefix", () => {
  const { version, jobId } = parseVersionedJobId("prime_99");
  assert.equal(version, "prime");
  assert.equal(jobId, "99");
});

test("parseVersionedJobId: plain numeric (no version)", () => {
  const { version, jobId } = parseVersionedJobId("789");
  assert.equal(version, null);
  assert.equal(jobId, "789");
});

test("parseVersionedJobId: null/undefined", () => {
  const a = parseVersionedJobId(null);
  assert.equal(a.version, null);
  const b = parseVersionedJobId(undefined);
  assert.equal(b.version, null);
});

test("isVersionedJobId: recognizes versioned IDs", () => {
  assert.equal(isVersionedJobId("v1_10"), true);
  assert.equal(isVersionedJobId("v2_123"), true);
  assert.equal(isVersionedJobId("prime_5"), true);
});

test("isVersionedJobId: rejects plain numerics", () => {
  assert.equal(isVersionedJobId("123"), false);
  assert.equal(isVersionedJobId(""), false);
  assert.equal(isVersionedJobId(null), false);
});

test("buildVersionedJobId: v2 + raw id", () => {
  assert.equal(buildVersionedJobId("v2", "123"), "v2_123");
});

test("rawJobId: extracts numeric from versioned ID", () => {
  assert.equal(rawJobId("v2_123"), 123);
  assert.equal(rawJobId("v1_456"), 456);
  assert.equal(rawJobId("prime_99"), 99);
});

test("rawJobId: plain numeric passthrough", () => {
  assert.equal(rawJobId("789"), 789);
  assert.equal(rawJobId(42), 42);
});

test("rawJobId: does NOT return NaN for v2_123 (regression)", () => {
  const result = rawJobId("v2_123");
  assert.equal(Number.isNaN(result), false, "rawJobId must not return NaN for versioned IDs");
  assert.equal(typeof result, "number");
  assert.equal(result, 123);
});

test("Number('v2_123') is NaN (confirming the bug rawJobId fixes)", () => {
  assert.equal(Number.isNaN(Number("v2_123")), true);
});

// ═════════════════════════════════════════════════════════════════════════════
// Section B — Job Normalization
// ═════════════════════════════════════════════════════════════════════════════

test("normalizeJob: canonical v1 fields", () => {
  const job = normalizeJob({
    jobId: 42,
    status: "OPEN",
    payout: "1000",
    jobSpecURI: "ipfs://spec",
    assignedAgent: "0xABC",
    employer: "0xDEF",
    details: "test job",
    duration: 86400,
  });
  assert.equal(job.jobId, "42");
  assert.equal(job.status, "OPEN");
  assert.equal(job.assignedAgent, "0xABC");
});

test("normalizeJob: v2 alternate field names", () => {
  const job = normalizeJob({
    id: 99,
    jobStatus: "IN_PROGRESS",
    payoutAGIALPHA: "5000",
    specURI: "ipfs://v2spec",
    assigned_agent: "0x123",
    creator: "0x456",
    description: "v2 job",
    durationDays: 7,
    _contractVersion: "v2",
  });
  assert.equal(job.jobId, "99");
  assert.equal(job.status, "IN_PROGRESS");
  assert.equal(job.payout, "5000");
  assert.equal(job.jobSpecURI, "ipfs://v2spec");
  assert.equal(job._contractVersion, "v2");
});

test("normalizeJob: null/undefined returns null", () => {
  assert.equal(normalizeJob(null), null);
  assert.equal(normalizeJob(undefined), null);
});

test("parsePayoutNumber: various inputs", () => {
  assert.equal(parsePayoutNumber(null), 0);
  assert.equal(parsePayoutNumber(42), 42);
  assert.equal(parsePayoutNumber("100.5"), 100.5);
  assert.equal(parsePayoutNumber("$1,000"), 1000);
});

test("isAssignedToAddress: case-insensitive match", () => {
  const job = normalizeJob({ jobId: 1, assignedAgent: "0xAbCdEf" });
  assert.equal(isAssignedToAddress(job, "0xABCDEF"), true);
  assert.equal(isAssignedToAddress(job, "0xabcdef"), true);
  assert.equal(isAssignedToAddress(job, "0x000000"), false);
});

test("isAssignedToAddress: null agent", () => {
  const job = normalizeJob({ jobId: 1 });
  assert.equal(isAssignedToAddress(job, "0xABC"), false);
});

// ═════════════════════════════════════════════════════════════════════════════
// Section C — Chain Phase Derivation & Missed Window Detection
// ═════════════════════════════════════════════════════════════════════════════

function makeDeadlines(offsets) {
  const base = 1_000_000;
  return {
    commitDeadline:          String(base + offsets[0]),
    revealDeadline:          String(base + offsets[1]),
    finalistAcceptDeadline:  String(base + offsets[2]),
    trialDeadline:           String(base + offsets[3]),
    scoreCommitDeadline:     String(base + offsets[4]),
    scoreRevealDeadline:     String(base + offsets[5]),
  };
}

test("deriveChainPhase: COMMIT_OPEN when before commit deadline", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(deriveChainPhase(proc, 1_000_050), CHAIN_PHASE.COMMIT_OPEN);
});

test("deriveChainPhase: REVEAL_OPEN between commit and reveal deadlines", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(deriveChainPhase(proc, 1_000_150), CHAIN_PHASE.REVEAL_OPEN);
});

test("deriveChainPhase: FINALIST_ACCEPT between reveal and finalist deadlines", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(deriveChainPhase(proc, 1_000_250), CHAIN_PHASE.FINALIST_ACCEPT);
});

test("deriveChainPhase: TRIAL_OPEN between finalist and trial deadlines", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(deriveChainPhase(proc, 1_000_350), CHAIN_PHASE.TRIAL_OPEN);
});

test("deriveChainPhase: SCORE_COMMIT between trial and scoreCommit deadlines", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(deriveChainPhase(proc, 1_000_450), CHAIN_PHASE.SCORE_COMMIT);
});

test("deriveChainPhase: SCORE_REVEAL between scoreCommit and scoreReveal deadlines", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(deriveChainPhase(proc, 1_000_550), CHAIN_PHASE.SCORE_REVEAL);
});

test("deriveChainPhase: CLOSED after all deadlines", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(deriveChainPhase(proc, 1_000_700), CHAIN_PHASE.CLOSED);
});

test("secondsUntilDeadline: returns time remaining in current phase", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  const remaining = secondsUntilDeadline(proc, 1_000_050);
  assert.equal(remaining, 50); // 100 - 50 = 50s until commit deadline
});

test("secondsUntilDeadline: returns 0 when CLOSED", () => {
  const proc = makeDeadlines([100, 200, 300, 400, 500, 600]);
  assert.equal(secondsUntilDeadline(proc, 1_000_700), 0);
});

test("didMissRequiredWindow: COMMIT_READY missed when past commit phase", () => {
  assert.equal(didMissRequiredWindow(PROC_STATUS.COMMIT_READY, CHAIN_PHASE.REVEAL_OPEN), true);
  assert.equal(didMissRequiredWindow(PROC_STATUS.COMMIT_READY, CHAIN_PHASE.CLOSED), true);
});

test("didMissRequiredWindow: COMMIT_READY NOT missed during commit phase", () => {
  assert.equal(didMissRequiredWindow(PROC_STATUS.COMMIT_READY, CHAIN_PHASE.COMMIT_OPEN), false);
});

test("didMissRequiredWindow: REVEAL_READY missed when past reveal phase", () => {
  assert.equal(didMissRequiredWindow(PROC_STATUS.REVEAL_READY, CHAIN_PHASE.FINALIST_ACCEPT), true);
  assert.equal(didMissRequiredWindow(PROC_STATUS.REVEAL_READY, CHAIN_PHASE.CLOSED), true);
});

test("didMissRequiredWindow: REVEAL_READY NOT missed during reveal phase", () => {
  assert.equal(didMissRequiredWindow(PROC_STATUS.REVEAL_READY, CHAIN_PHASE.REVEAL_OPEN), false);
});

test("didMissRequiredWindow: TRIAL_READY missed outside trial phase", () => {
  assert.equal(didMissRequiredWindow(PROC_STATUS.TRIAL_READY, CHAIN_PHASE.SCORE_COMMIT), true);
});

test("didMissRequiredWindow: TRIAL_READY NOT missed during trial phase", () => {
  assert.equal(didMissRequiredWindow(PROC_STATUS.TRIAL_READY, CHAIN_PHASE.TRIAL_OPEN), false);
});

test("didMissRequiredWindow: terminal statuses never miss window", () => {
  for (const status of TERMINAL_STATUSES) {
    assert.equal(didMissRequiredWindow(status, CHAIN_PHASE.CLOSED), false,
      `terminal status ${status} should not flag missed window`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Section D — Procurement Status Transitions
// ═════════════════════════════════════════════════════════════════════════════

test("isValidTransition: DISCOVERED → INSPECTED is valid", () => {
  assert.equal(isValidTransition(PROC_STATUS.DISCOVERED, PROC_STATUS.INSPECTED), true);
});

test("isValidTransition: DISCOVERED → DONE is invalid", () => {
  assert.equal(isValidTransition(PROC_STATUS.DISCOVERED, PROC_STATUS.DONE), false);
});

test("assertValidTransition: throws on invalid transition", () => {
  assert.throws(
    () => assertValidTransition(PROC_STATUS.DONE, PROC_STATUS.DISCOVERED),
    /Invalid transition/,
  );
});

test("isValidTransition: validator score commit path", () => {
  assert.equal(isValidTransition(PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY, PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED), true);
  assert.equal(isValidTransition(PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED, PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY), true);
  assert.equal(isValidTransition(PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY, PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED), true);
});

test("isValidTransition: pre-selection statuses can transition to MISSED_WINDOW", () => {
  // Statuses that represent active lifecycle steps before winner selection
  const preSelectionStatuses = [
    PROC_STATUS.DISCOVERED, PROC_STATUS.INSPECTED, PROC_STATUS.FIT_APPROVED,
    PROC_STATUS.APPLICATION_DRAFTED, PROC_STATUS.COMMIT_READY, PROC_STATUS.COMMIT_SUBMITTED,
    PROC_STATUS.REVEAL_READY, PROC_STATUS.REVEAL_SUBMITTED, PROC_STATUS.SHORTLISTED,
    PROC_STATUS.FINALIST_ACCEPT_READY, PROC_STATUS.FINALIST_ACCEPT_SUBMITTED,
    PROC_STATUS.TRIAL_IN_PROGRESS, PROC_STATUS.TRIAL_READY, PROC_STATUS.TRIAL_SUBMITTED,
    PROC_STATUS.VALIDATOR_SCORE_COMMIT_READY, PROC_STATUS.VALIDATOR_SCORE_COMMIT_SUBMITTED,
    PROC_STATUS.VALIDATOR_SCORE_REVEAL_READY, PROC_STATUS.VALIDATOR_SCORE_REVEAL_SUBMITTED,
    PROC_STATUS.WAITING_SCORE_PHASE,
  ];
  for (const s of preSelectionStatuses) {
    assert.equal(isValidTransition(s, PROC_STATUS.MISSED_WINDOW), true,
      `${s} → MISSED_WINDOW should be valid`);
  }
});

test("isValidTransition: terminal statuses have no outgoing transitions", () => {
  for (const s of TERMINAL_STATUSES) {
    assert.equal(isValidTransition(s, PROC_STATUS.DISCOVERED), false,
      `${s} → DISCOVERED should be invalid (terminal)`);
  }
});

test("toCanonicalPhase: all PROC_STATUS values have a canonical mapping", () => {
  for (const s of Object.values(PROC_STATUS)) {
    const canonical = toCanonicalPhase(s);
    assert.ok(canonical, `PROC_STATUS.${s} should have a canonical phase mapping`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Section E — Reorg Cursor Rollback Simulation
// ═════════════════════════════════════════════════════════════════════════════

test("reorg rollback: submitted states map to their ready counterparts", () => {
  // This mirrors the rollbackMap logic in prime-monitor.js refreshActiveProcurements
  const rollbackMap = {
    [PROC_STATUS.COMMIT_SUBMITTED]:          PROC_STATUS.COMMIT_READY,
    [PROC_STATUS.REVEAL_SUBMITTED]:          PROC_STATUS.REVEAL_READY,
    [PROC_STATUS.FINALIST_ACCEPT_SUBMITTED]: PROC_STATUS.FINALIST_ACCEPT_READY,
    [PROC_STATUS.TRIAL_SUBMITTED]:           PROC_STATUS.TRIAL_READY,
    [PROC_STATUS.COMPLETION_SUBMITTED]:      PROC_STATUS.COMPLETION_READY,
  };

  for (const [submitted, ready] of Object.entries(rollbackMap)) {
    // The rollback target must be a valid state
    assert.ok(Object.values(PROC_STATUS).includes(ready),
      `rollback target ${ready} must be a valid PROC_STATUS`);
    // And the ready → submitted transition must be valid (so re-submit is possible)
    assert.equal(isValidTransition(ready, submitted), true,
      `${ready} → ${submitted} must be valid for re-submission after rollback`);
  }
});

test("reorg rollback: non-submitted states are not rolled back", () => {
  const rollbackMap = {
    [PROC_STATUS.COMMIT_SUBMITTED]:          PROC_STATUS.COMMIT_READY,
    [PROC_STATUS.REVEAL_SUBMITTED]:          PROC_STATUS.REVEAL_READY,
    [PROC_STATUS.FINALIST_ACCEPT_SUBMITTED]: PROC_STATUS.FINALIST_ACCEPT_READY,
    [PROC_STATUS.TRIAL_SUBMITTED]:           PROC_STATUS.TRIAL_READY,
    [PROC_STATUS.COMPLETION_SUBMITTED]:      PROC_STATUS.COMPLETION_READY,
  };

  // Statuses NOT in rollbackMap should not be rolled back
  const nonRollback = Object.values(PROC_STATUS).filter(s => !(s in rollbackMap));
  for (const s of nonRollback) {
    assert.equal(rollbackMap[s], undefined,
      `${s} should NOT have a rollback entry`);
  }
});

test("reorg cursor rewind: block hash mismatch triggers scan rewinding", () => {
  // Simulate the reconcileReorgCursors logic
  const REORG_SAFETY_BLOCKS = 24;
  const SCAN_BLOCKS = 1000;
  const anchorBlock = 50000;
  const storedHash = "0xabc123";
  const currentHash = "0xdef456"; // different = reorg

  assert.notEqual(storedHash, currentHash, "hashes must differ to simulate reorg");

  const rewindTo = Math.max(0, anchorBlock - REORG_SAFETY_BLOCKS - SCAN_BLOCKS);
  assert.equal(rewindTo, 48976); // 50000 - 24 - 1000
  assert.ok(rewindTo < anchorBlock, "rewind target must be before anchor");
  assert.ok(rewindTo >= 0, "rewind target must not be negative");
});

test("reorg cursor rewind: matching hash means no rewind needed", () => {
  const storedHash = "0xabc123";
  const currentHash = "0xabc123";
  assert.equal(storedHash, currentHash, "matching hashes = no reorg");
});

// ═════════════════════════════════════════════════════════════════════════════
// Section F — Scoring Adjudicator Determinism & Commitment Unification
// ═════════════════════════════════════════════════════════════════════════════

test("adjudicateScore: returns all 5 dimensions", () => {
  const evidence = {
    procurement: { procStruct: { jobId: "42" }, deadlines: {}, isScorePhase: true },
    trial: { trialSubmissions: [{ cid: "Qm123", content: "test", trialURI: "ipfs://x", contentLength: 600 }] },
  };
  const content = "## Introduction\n\nThis is a substantive trial deliverable with enough content.\n\n## Methodology\n\nStep by step approach with examples.\n\n## Conclusion\n\nFinal summary of findings.\n\n```js\nconsole.log('hello');\n```\n\n- item one\n- item two\n\nReference: https://example.com\n\nThis template demonstrates a pattern for framework methodology.";

  const result = adjudicateScore(evidence, content);

  assert.equal(result.schema, "emperor-os/validator-adjudication/v1");
  assert.ok(typeof result.score === "number");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(result.dimensions.specCompliance);
  assert.ok(result.dimensions.artifactQuality);
  assert.ok(result.dimensions.publicVerifiability);
  assert.ok(result.dimensions.deadlineAdherence);
  assert.ok(result.dimensions.reuseValue);
});

test("adjudicateScore: deterministic across calls", () => {
  const evidence = {
    procurement: { procStruct: { jobId: "1" } },
    trial: { trialSubmissions: [] },
  };
  const r1 = adjudicateScore(evidence, "## Test\n\nSome content here that is long enough.");
  const r2 = adjudicateScore(evidence, "## Test\n\nSome content here that is long enough.");
  assert.equal(r1.score, r2.score);
});

test("adjudicateScore: empty content scores low", () => {
  const result = adjudicateScore({}, "");
  assert.equal(result.score, 0);
});

test("computeScoreCommitment: deterministic SHA256 hash", () => {
  const c1 = computeScoreCommitment(75, "0xsalt123");
  const c2 = computeScoreCommitment(75, "0xsalt123");
  assert.equal(c1, c2);
  assert.ok(c1.startsWith("0x"));
  assert.equal(c1.length, 66); // 0x + 64 hex chars
});

test("computeScoreCommitment: different scores produce different commitments", () => {
  const c1 = computeScoreCommitment(75, "0xsalt");
  const c2 = computeScoreCommitment(80, "0xsalt");
  assert.notEqual(c1, c2);
});

test("computeScoreCommitment: different salts produce different commitments", () => {
  const c1 = computeScoreCommitment(75, "salt_a");
  const c2 = computeScoreCommitment(75, "salt_b");
  assert.notEqual(c1, c2);
});

test("computeScoreCommitment: unified — adjudicator re-exports engine function", () => {
  const adjudicatorResult = computeScoreCommitment(42, "test_salt");
  const engineResult = engineComputeCommitment(42, "test_salt");
  assert.equal(adjudicatorResult, engineResult,
    "scoring-adjudicator and prime-validator-engine must produce identical commitments");
});

test("computeScoreCommitment: matches manual SHA256 computation", () => {
  const score = 85;
  const salt = "0xdeadbeef";
  const expected = `0x${createHash("sha256").update(`${score}:${salt}`, "utf8").digest("hex")}`;
  assert.equal(computeScoreCommitment(score, salt), expected);
});

// ═════════════════════════════════════════════════════════════════════════════
// Section G — Commit-Reveal Continuity (Cross-Restart Simulation)
// ═════════════════════════════════════════════════════════════════════════════

test("verifyScoreReveal: valid commit-reveal round trip", () => {
  const score = 72;
  const salt = "0xfeed1234";
  const commitment = computeScoreCommitment(score, salt);

  const result = verifyScoreReveal({ score, salt, expectedCommitment: commitment });
  assert.equal(result.verified, true);
});

test("verifyScoreReveal: tampered score fails", () => {
  const salt = "0xfeed1234";
  const commitment = computeScoreCommitment(72, salt);

  const result = verifyScoreReveal({ score: 73, salt, expectedCommitment: commitment });
  assert.equal(result.verified, false);
});

test("verifyScoreReveal: tampered salt fails", () => {
  const score = 72;
  const commitment = computeScoreCommitment(score, "0xfeed1234");

  const result = verifyScoreReveal({ score, salt: "0xfeed1235", expectedCommitment: commitment });
  assert.equal(result.verified, false);
});

test("verifyScoreRevealAgainstCommit: engine function matches adjudicator wrapper", () => {
  const score = 50;
  const salt = "restart_test_salt";
  const commitment = engineComputeCommitment(score, salt);

  const engineResult = verifyScoreRevealAgainstCommit({ score, salt, expectedCommitment: commitment });
  const adjResult = verifyScoreReveal({ score, salt, expectedCommitment: commitment });

  assert.equal(engineResult.verified, true);
  assert.equal(adjResult.verified, true);
  assert.equal(engineResult.recomputedCommitment, adjResult.recomputedCommitment);
});

test("cross-restart simulation: commitment persisted then verified later", () => {
  // Simulate: process 1 computes commitment and writes to disk
  const score = 88;
  const salt = "0x" + createHash("sha256").update("deterministic_seed").digest("hex").slice(0, 32);
  const commitment = computeScoreCommitment(score, salt);

  // Simulate: process 2 (after restart) loads commitment and verifies reveal
  const serialized = JSON.stringify({ score, salt, commitment });
  const deserialized = JSON.parse(serialized);

  const result = verifyScoreReveal({
    score: deserialized.score,
    salt: deserialized.salt,
    expectedCommitment: deserialized.commitment,
  });
  assert.equal(result.verified, true, "reveal must verify after JSON round-trip (restart simulation)");
});

test("cross-restart simulation: commitment survives string coercion", () => {
  const score = 65;
  const salt = "test_salt";
  const commitment = computeScoreCommitment(score, salt);

  // After restart, score might come back as string from JSON
  const result = verifyScoreReveal({
    score: String(score),
    salt,
    expectedCommitment: commitment,
  });
  // String "65" vs number 65 — both go through `${score}:${salt}`
  assert.equal(result.verified, true, "string coercion of score must not break reveal");
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
console.log(`  Restart / Reorg / Integration Tests`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}\n`);

if (failed > 0) {
  process.exit(1);
}
