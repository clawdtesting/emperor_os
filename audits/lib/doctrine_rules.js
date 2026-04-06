// audits/lib/doctrine_rules.js
// Central source for Emperor_OS doctrine constants and forbidden patterns.
// Do not scatter doctrine rules everywhere — this is the single source of truth.

import { FORBIDDEN_SIGNING_PATTERNS, FORBIDDEN_BROADCAST_PATTERNS, REQUIRED_DOCTRINE_FILES, MAX_FRESHNESS_MS } from "./constants.js";

export const DOCTRINE_RULES = {
  // LLM boundaries
  maxLlmCallsPerJob: 1,
  noLlmBeforeAssignment: true,
  noLlmBeforeFitApproval: true,

  // Signing boundary
  noPrivateKeyInRuntime: true,
  unsignedHandoffOnly: true,
  forbiddenSigningPatterns: FORBIDDEN_SIGNING_PATTERNS,
  forbiddenBroadcastPatterns: FORBIDDEN_BROADCAST_PATTERNS,

  // State discipline
  explicitStateRequired: true,
  atomicWritesRequired: true,

  // Artifact discipline
  artifactsAreTruth: true,
  reusableResidueRequired: true,

  // Human authority
  humanReviewBeforeTx: true,
  humanReviewBeforeIpfsPublish: true,

  // Freshness
  maxPackageAgeMs: MAX_FRESHNESS_MS,

  // Required files
  requiredDoctrineFiles: REQUIRED_DOCTRINE_FILES,
};

export function getForbiddenPatterns() {
  return [...FORBIDDEN_SIGNING_PATTERNS, ...FORBIDDEN_BROADCAST_PATTERNS];
}

export function checkDoctrineViolation(code, ruleName) {
  const rule = DOCTRINE_RULES[ruleName];
  if (!rule) return { violated: false, reason: "unknown rule" };

  if (ruleName === "noLlmBeforeAssignment") {
    // Check for LLM calls outside assignment context
    return { violated: false, reason: "static check — requires runtime context" };
  }

  if (ruleName === "unsignedHandoffOnly") {
    for (const pattern of FORBIDDEN_SIGNING_PATTERNS) {
      if (code.includes(pattern)) {
        return { violated: true, reason: `Found forbidden pattern: ${pattern}` };
      }
    }
    for (const pattern of FORBIDDEN_BROADCAST_PATTERNS) {
      if (code.includes(pattern)) {
        return { violated: true, reason: `Found forbidden pattern: ${pattern}` };
      }
    }
    return { violated: false };
  }

  return { violated: false, reason: "rule not statically checkable" };
}
