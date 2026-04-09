import { selectExecutionTier } from "./tier-selector.js";
import {
  estimateExecutionCost,
  evaluateMargin,
  normalizePayoutToUsd
} from "./economics.js";

const DEFAULT_GATE_POLICY = Object.freeze({
  marginMultiplier: 1.25,
  minConfidence: 0.6
});

function deriveConfidence(jobSpec, complexity) {
  if (typeof jobSpec.confidenceScore === "number") {
    return Math.max(0, Math.min(1, jobSpec.confidenceScore));
  }

  const heuristic = 1 - complexity.score / 120;
  return Math.max(0, Math.min(1, heuristic));
}

export function shouldApply(jobSpec, protocolId, options = {}) {
  const gatePolicy = { ...DEFAULT_GATE_POLICY, ...(options.gatePolicy ?? {}) };
  const pricing = options.pricing ?? {};

  const selection = selectExecutionTier(jobSpec, protocolId);
  const rejectionReasons = [];

  if (!selection.allowed || !selection.selectedTier) {
    rejectionReasons.push("execution_not_feasible_under_allowed_tiers");
  }

  const executionCost = selection.selectedTier
    ? estimateExecutionCost(jobSpec, selection.selectedTier, selection.complexity, pricing)
    : { modelCalls: 0, tokens: 0, usdCost: 0, wallClockTime: 0, withinBudget: false };

  if (!executionCost.withinBudget) {
    rejectionReasons.push("execution_cost_exceeds_budget");
  }

  const payout = normalizePayoutToUsd(jobSpec, pricing);
  const margin = evaluateMargin(payout.payoutUsd, executionCost.usdCost, gatePolicy.marginMultiplier);

  if (!margin.passes) {
    rejectionReasons.push("fails_margin_policy");
  }

  const validationFeasible = Boolean(selection.features?.validationAvailable);
  if (!validationFeasible) {
    rejectionReasons.push("validation_not_feasible");
  }

  const confidence = deriveConfidence(jobSpec, selection.complexity);
  if (confidence < gatePolicy.minConfidence) {
    rejectionReasons.push("confidence_below_threshold");
  }

  const shouldApplyDecision = rejectionReasons.length === 0;

  return {
    shouldApply: shouldApplyDecision,
    protocolId,
    selectedTier: selection.selectedTier,
    selection,
    economic: {
      executionCost,
      payout,
      margin,
      requiredMarginMultiplier: gatePolicy.marginMultiplier
    },
    validationFeasible,
    confidence,
    minConfidence: gatePolicy.minConfidence,
    rejectionReasons
  };
}
