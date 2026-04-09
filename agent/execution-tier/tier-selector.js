import { classifyArchetype } from "./archetype-classifier.js";
import { scoreComplexity } from "./complexity-score.js";
import { extractJobFeatures } from "./feature-extractor.js";
import {
  EXECUTION_TIERS,
  TIER_RULE_SCHEMA
} from "./policies.js";
import {
  assertExecutionTierAllowed,
  getAllowedExecutionTiers,
  getArchetypeDefaultTier,
  validateJobFeatures
} from "./policy-engine.js";

function evaluateTierConstraints(tier, features) {
  const rule = TIER_RULE_SCHEMA[tier];
  const reasons = [];

  if (!rule) {
    return { ok: false, reasons: [`missing_rule_for_${tier}`] };
  }

  if (tier === "T1_ONE_SHOT") {
    if (features.deliverableCount > rule.constraints.deliverableCountMax) {
      reasons.push(`deliverableCount>${rule.constraints.deliverableCountMax}`);
    }
    if (features.ambiguityScore > rule.constraints.ambiguityScoreMax) {
      reasons.push(`ambiguityScore>${rule.constraints.ambiguityScoreMax}`);
    }
    if (features.externalToolsRequired > rule.constraints.externalToolsRequiredMax) {
      reasons.push(`externalToolsRequired>${rule.constraints.externalToolsRequiredMax}`);
    }
    if (features.iterationRisk > rule.constraints.iterationRiskMax) {
      reasons.push(`iterationRisk>${rule.constraints.iterationRiskMax}`);
    }
  }

  if (tier === "T2_REPAIR_LOOP") {
    if (features.deliverableCount > rule.constraints.deliverableCountMax) {
      reasons.push(`deliverableCount>${rule.constraints.deliverableCountMax}`);
    }
    if (rule.constraints.validationAvailableRequired && !features.validationAvailable) {
      reasons.push("validationAvailable=false");
    }
    if (features.iterationRisk > rule.constraints.iterationRiskMax) {
      reasons.push(`iterationRisk>${rule.constraints.iterationRiskMax}`);
    }
    if (features.crossArtifactDependencies && features.deliverableCount > 1) {
      reasons.push("major_decomposition_required");
    }
  }

  if (tier === "T3_PLANNER_EXECUTOR") {
    if (features.deliverableCount < rule.constraints.multipleDependentOutputsMin) {
      reasons.push(`deliverableCount<${rule.constraints.multipleDependentOutputsMin}`);
    }
    if (rule.constraints.crossArtifactDependenciesRequired && !features.crossArtifactDependencies) {
      reasons.push("crossArtifactDependencies=false");
    }
    if (features.ambiguityScore < rule.constraints.ambiguityScoreMin) {
      reasons.push(`ambiguityScore<${rule.constraints.ambiguityScoreMin}`);
    }
    if (features.externalToolsRequired < rule.constraints.externalToolsRequiredMin) {
      reasons.push(`externalToolsRequired<${rule.constraints.externalToolsRequiredMin}`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}

function orderedAllowedTiers(protocolId) {
  const allowed = new Set(getAllowedExecutionTiers(protocolId));
  return EXECUTION_TIERS.filter((tier) => allowed.has(tier));
}

export function selectExecutionTier(jobSpec, protocolId) {
  const { features, reasons: featureReasons } = extractJobFeatures(jobSpec);
  validateJobFeatures(features);

  const archetype = classifyArchetype(jobSpec, features);
  const complexity = scoreComplexity(features);
  const allowedTiers = orderedAllowedTiers(protocolId);

  const rejectedTiers = [];
  let selectedTier = null;

  for (const tier of allowedTiers) {
    assertExecutionTierAllowed(protocolId, tier);
    const evaluation = evaluateTierConstraints(tier, features);

    if (evaluation.ok) {
      selectedTier = tier;
      break;
    }

    rejectedTiers.push({ tier, reasons: evaluation.reasons });
  }

  if (!selectedTier) {
    return {
      selectedTier: null,
      allowed: false,
      protocolId,
      allowedTiers,
      archetype,
      complexity,
      features,
      featureReasons,
      rejectedTiers,
      reason: "no_allowed_tier_satisfies_constraints"
    };
  }

  return {
    selectedTier,
    allowed: true,
    protocolId,
    allowedTiers,
    archetype,
    archetypeDefaultTier: getArchetypeDefaultTier(archetype.archetype),
    complexity,
    features,
    featureReasons,
    rejectedTiers
  };
}
