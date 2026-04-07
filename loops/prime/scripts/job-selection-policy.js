#!/usr/bin/env node
/**
 * job-selection-policy.js — Deterministic job acceptance policy.
 *
 * This module enforces explicit scoring and rejection constraints so that
 * misclassification is converted into hard rules (not intuition).
 */
"use strict";

const REJECTION_RULES = [
  {
    code: "STATUS_NOT_OPEN",
    test: (job) => String(job?.status || "").toLowerCase() !== "open",
    reason: "Job status is not Open",
  },
  {
    code: "MISSING_SPEC_URI",
    test: (job) => !job?.specURI,
    reason: "Missing specURI",
  },
  {
    code: "INVALID_SCORE",
    test: (job) => Number.isNaN(Number(job?.score)),
    reason: "Score is missing or NaN",
  },
  {
    code: "LOW_FEASIBILITY",
    test: (job) => String(job?.feasibility || "").toLowerCase() === "low",
    reason: "Feasibility marked low",
  },
];

function normalizeScore(raw) {
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function computePolicyScore(job) {
  const score = normalizeScore(job?.score);
  const payout = Number(job?.payout_agialpha || 0);
  const payoutBoost = Math.min(0.15, payout / 100_000);
  const recommendationBoost = String(job?.recommendation || "").toLowerCase() === "apply" ? 0.1 : 0;
  return Number((score + payoutBoost + recommendationBoost).toFixed(4));
}

function evaluateJob(job) {
  const failures = REJECTION_RULES.filter((rule) => rule.test(job));
  if (failures.length > 0) {
    return {
      allowed: false,
      policyScore: 0,
      decision: "reject",
      reasons: failures.map((f) => `${f.code}: ${f.reason}`),
    };
  }

  const policyScore = computePolicyScore(job);
  if (policyScore < 0.55) {
    return {
      allowed: false,
      policyScore,
      decision: "reject",
      reasons: ["SCORE_BELOW_THRESHOLD: policyScore < 0.55"],
    };
  }

  if (String(job?.recommendation || "").toLowerCase() === "review") {
    return {
      allowed: true,
      policyScore,
      decision: "review",
      reasons: ["REVIEW_REQUIRED: Recommendation is review"],
    };
  }

  return {
    allowed: true,
    policyScore,
    decision: "accept",
    reasons: ["POLICY_ACCEPTED"],
  };
}

module.exports = {
  REJECTION_RULES,
  computePolicyScore,
  evaluateJob,
};
