import { canEscalateTier } from "./policy-engine.js";

export function shouldEscalate({
  protocolId,
  fromTier,
  toTier,
  currentEscalations,
  budgetRemaining,
  failureRepairable
}) {
  if (!failureRepairable) {
    return {
      escalate: false,
      reason: "failure_not_repairable"
    };
  }

  if (!budgetRemaining) {
    return {
      escalate: false,
      reason: "insufficient_budget"
    };
  }

  if (!canEscalateTier(fromTier, toTier, currentEscalations, protocolId)) {
    return {
      escalate: false,
      reason: "policy_disallows_escalation"
    };
  }

  return {
    escalate: true,
    reason: "escalation_allowed"
  };
}
