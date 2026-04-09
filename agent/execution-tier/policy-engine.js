import {
  ARCHETYPE_DEFAULT_TIER,
  ESCALATION_POLICY_SCHEMA,
  EXECUTION_TIERS,
  JOB_FEATURE_SCHEMA,
  PROTOCOL_TIER_POLICY,
  TIER_RULE_SCHEMA
} from "./policies.js";

function getPolicy(protocolId) {
  const policy = PROTOCOL_TIER_POLICY[protocolId];
  if (!policy) {
    throw new Error(`Unknown protocol policy: ${protocolId}`);
  }
  return policy;
}

export function getAllowedExecutionTiers(protocolId) {
  return [...getPolicy(protocolId).allowedExecutionTiers];
}

export function isExecutionTierAllowed(protocolId, tier) {
  return getPolicy(protocolId).allowedExecutionTiers.includes(tier);
}

export function assertExecutionTierAllowed(protocolId, tier) {
  if (!isExecutionTierAllowed(protocolId, tier)) {
    throw new Error(`Disallowed execution tier ${tier} for protocol ${protocolId}`);
  }
  return true;
}

export function getArchetypeDefaultTier(archetype) {
  const tier = ARCHETYPE_DEFAULT_TIER[archetype];
  if (!tier) {
    throw new Error(`Unknown archetype: ${archetype}`);
  }
  return tier;
}

export function getTierRule(tier) {
  const rule = TIER_RULE_SCHEMA[tier];
  if (!rule) {
    throw new Error(`Unknown tier rule: ${tier}`);
  }
  return rule;
}

export function getEscalationPolicy() {
  return {
    enabled: ESCALATION_POLICY_SCHEMA.enabled,
    maxEscalations: ESCALATION_POLICY_SCHEMA.maxEscalations,
    allowedPaths: ESCALATION_POLICY_SCHEMA.allowedPaths.map((path) => [...path])
  };
}

export function canEscalateTier(fromTier, toTier, currentEscalations, protocolId) {
  if (!ESCALATION_POLICY_SCHEMA.enabled) {
    return false;
  }

  if (currentEscalations >= ESCALATION_POLICY_SCHEMA.maxEscalations) {
    return false;
  }

  if (!isExecutionTierAllowed(protocolId, toTier)) {
    return false;
  }

  return ESCALATION_POLICY_SCHEMA.allowedPaths.some(
    ([from, to]) => from === fromTier && to === toTier
  );
}

export function validateJobFeatures(features) {
  if (!features || typeof features !== "object") {
    throw new Error("job features must be an object");
  }

  for (const [field, schema] of Object.entries(JOB_FEATURE_SCHEMA)) {
    if (!(field in features)) {
      throw new Error(`Missing job feature: ${field}`);
    }

    const value = features[field];
    if (schema.type === "integer") {
      if (!Number.isInteger(value)) {
        throw new Error(`${field} must be an integer`);
      }
    }

    if (schema.type === "number") {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`${field} must be a number`);
      }
    }

    if (schema.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new Error(`${field} must be a boolean`);
      }
    }

    if (schema.min != null && value < schema.min) {
      throw new Error(`${field} must be >= ${schema.min}`);
    }

    if (schema.max != null && value > schema.max) {
      throw new Error(`${field} must be <= ${schema.max}`);
    }
  }

  return true;
}

export function listExecutionTierConfig() {
  return {
    executionTiers: [...EXECUTION_TIERS],
    protocolTierPolicy: PROTOCOL_TIER_POLICY,
    jobFeatureSchema: JOB_FEATURE_SCHEMA,
    archetypeDefaultTier: ARCHETYPE_DEFAULT_TIER,
    tierRuleSchema: TIER_RULE_SCHEMA,
    escalationPolicySchema: ESCALATION_POLICY_SCHEMA
  };
}
