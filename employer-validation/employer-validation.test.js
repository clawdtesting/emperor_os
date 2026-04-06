// employer-validation/employer-validation.test.js
// Tests for employer-side validation pipeline.
//
// Run: node employer-validation/employer-validation.test.js

import { strict as assert } from "assert";
import { EMPLOYER_CONFIG } from "./config.js";

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

// ── Config Tests ──────────────────────────────────────────────────────────────

test("employer config has required fields", () => {
  assert.ok(EMPLOYER_CONFIG.MIN_DELIVERABLE_CHARS > 0);
  assert.ok(EMPLOYER_CONFIG.MIN_SUBSTANTIVE_CHARS > 0);
  assert.ok(EMPLOYER_CONFIG.MIN_COMPLETION_SCORE >= 0);
  assert.ok(EMPLOYER_CONFIG.AUTO_ACCEPT_SCORE > EMPLOYER_CONFIG.MIN_COMPLETION_SCORE);
  assert.ok(EMPLOYER_CONFIG.AUTO_DISPUTE_SCORE < EMPLOYER_CONFIG.MIN_COMPLETION_SCORE);
});

test("employer config has forbidden patterns", () => {
  assert.ok(Array.isArray(EMPLOYER_CONFIG.FORBIDDEN_PATTERNS));
  assert.ok(EMPLOYER_CONFIG.FORBIDDEN_PATTERNS.length > 0);
});

// ── Content Quality Evaluation Tests ──────────────────────────────────────────

test("content quality scores high for good deliverable", async () => {
  const { evaluateContentQuality } = await import("./deliverable-review.js");
  const content = `## Introduction

This is a comprehensive deliverable that addresses all requirements of the project specification. The work has been thoroughly completed with attention to detail and quality standards.

## Analysis

Here is detailed analysis with proper structure and formatting throughout the document. Each section addresses a specific requirement from the original job specification.

- Point one: detailed explanation of the first requirement
- Point two: detailed explanation of the second requirement
- Point three: detailed explanation of the third requirement

\`\`\`javascript
const result = compute(42);
console.log(result);
\`\`\`

## Conclusion

The work demonstrates the approach effectively and meets all stated requirements. The deliverable is complete and ready for review and acceptance by the employer.
`;
  const result = evaluateContentQuality(content);
  assert.ok(result.score > 60, `Expected score > 60, got ${result.score}`);
  assert.ok(result.stats.wordCount > 30);
  assert.ok(result.checks.some(c => c.name === "meets_min_length" && c.passed));
  assert.ok(result.checks.some(c => c.name === "no_forbidden_patterns" && c.passed));
});

test("content quality scores low for empty content", async () => {
  const { evaluateContentQuality } = await import("./deliverable-review.js");
  const result = evaluateContentQuality("");
  assert.strictEqual(result.score, 0);
  assert.ok(result.errors.length > 0);
});

test("content quality detects forbidden patterns", async () => {
  const { evaluateContentQuality } = await import("./deliverable-review.js");
  const content = `## Deliverable

As an AI language model, I can't provide the full solution.

Here's the final deliverable for your review.
`;
  const result = evaluateContentQuality(content);
  assert.ok(result.score < 50);
  assert.ok(result.checks.some(c => c.name === "no_forbidden_patterns" && !c.passed));
});

test("content quality detects placeholders", async () => {
  const { evaluateContentQuality } = await import("./deliverable-review.js");
  const content = `## Deliverable

Here is the solution: **[insert code here]**

More details coming soon.
`;
  const result = evaluateContentQuality(content);
  assert.ok(result.checks.some(c => c.name === "no_placeholders" && !c.passed));
});

// ── Spec Compliance Tests ────────────────────────────────────────────────────

test("spec compliance scores high when content matches spec", async () => {
  const { evaluateSpecCompliance } = await import("./deliverable-review.js");
  const spec = {
    title: "Build a REST API",
    description: "Create a REST API with authentication",
    required_sections: ["Introduction", "API Endpoints", "Authentication", "Conclusion"],
  };
  const content = `## Introduction

This document describes the REST API implementation.

## API Endpoints

The following endpoints are available:
- GET /users
- POST /users
- GET /users/:id

## Authentication

All endpoints require Bearer token authentication.

## Conclusion

The REST API is complete and tested.
`;
  const result = evaluateSpecCompliance(content, spec);
  assert.ok(result.score > 60, `Expected score > 60, got ${result.score}`);
  assert.ok(result.checks.some(c => c.name === "required_sections" && c.passed));
});

test("spec compliance scores low when content does not match spec", async () => {
  const { evaluateSpecCompliance } = await import("./deliverable-review.js");
  const spec = {
    title: "Build a Machine Learning Pipeline",
    required_sections: ["Data Collection", "Feature Engineering", "Model Training", "Evaluation"],
  };
  const content = `## Random Notes

Some unrelated content about cooking recipes.

- Step 1: Boil water
- Step 2: Add pasta
`;
  const result = evaluateSpecCompliance(content, spec);
  assert.ok(result.score < 50, `Expected score < 50, got ${result.score}`);
});

// ── Scoring and Recommendation Tests ─────────────────────────────────────────

test("overall score computation is weighted correctly", async () => {
  const { computeOverallScore } = await import("./deliverable-review.js");
  const contentQuality = { score: 80 };
  const specCompliance = { score: 60 };
  const overall = computeOverallScore(contentQuality, specCompliance);
  // 0.4 * 80 + 0.6 * 60 = 32 + 36 = 68
  assert.strictEqual(overall, 68);
});

test("high score generates ACCEPT recommendation", async () => {
  const { generateRecommendation } = await import("./deliverable-review.js");
  const rec = generateRecommendation(85);
  assert.strictEqual(rec.action, "ACCEPT");
  assert.strictEqual(rec.confidence, "HIGH");
});

test("medium score generates REVIEW recommendation", async () => {
  const { generateRecommendation } = await import("./deliverable-review.js");
  const rec = generateRecommendation(60);
  assert.strictEqual(rec.action, "REVIEW");
});

test("low score generates DISPUTE recommendation", async () => {
  const { generateRecommendation } = await import("./deliverable-review.js");
  const rec = generateRecommendation(15);
  assert.strictEqual(rec.action, "DISPUTE");
  assert.strictEqual(rec.confidence, "HIGH");
});

// ── Review Decision Package Tests ─────────────────────────────────────────────

test("review decision package has correct schema", async () => {
  const { buildReviewDecisionPackage } = await import("./tx-builder.js");
  const pkg = buildReviewDecisionPackage({
    jobId: "42",
    review: { overallScore: 75, recommendation: { action: "REVIEW" } },
    decision: "REVIEW",
    reason: "Manual review needed",
  });
  assert.strictEqual(pkg.schema, "emperor-os/employer-review-decision/v1");
  assert.strictEqual(pkg.jobId, "42");
  assert.strictEqual(pkg.decision, "REVIEW");
  assert.ok(pkg.reviewChecklist.length > 0);
});

test("review decision package includes safety flags", async () => {
  const { buildReviewDecisionPackage } = await import("./tx-builder.js");
  const pkg = buildReviewDecisionPackage({
    jobId: "1",
    review: { overallScore: 50 },
    decision: "ACCEPT",
    reason: "Test",
  });
  assert.strictEqual(pkg.safety.noPrivateKeyInRuntime, true);
  assert.strictEqual(pkg.safety.noSigningInRuntime, true);
  assert.strictEqual(pkg.safety.noBroadcastInRuntime, true);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n══ Employer Validation Test Results ═══════════════════`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log(`══════════════════════════════════════════════════════\n`);

if (failed > 0) {
  process.exit(1);
}
