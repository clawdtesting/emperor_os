import { getTierRule } from "./policy-engine.js";

const DEFAULT_PRICING = Object.freeze({
  usdPer1kTokens: 0.012,
  baseOverheadUsd: 0.02,
  secondsPerModelCall: 25,
  agiAlphaToUsd: 1
});

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function estimateExecutionCost(jobSpec, selectedTier, complexity, pricing = {}) {
  const config = { ...DEFAULT_PRICING, ...pricing };
  const tierRule = getTierRule(selectedTier);

  const modelCalls = tierRule.maxModelCalls;
  const complexityFactor = Math.max(0.35, complexity.score / 100);
  const tokens = Math.round(modelCalls * (900 + complexityFactor * 2200));
  const usdCost = Number((config.baseOverheadUsd + (tokens / 1000) * config.usdPer1kTokens).toFixed(6));
  const wallClockTime = Math.round(modelCalls * config.secondsPerModelCall * (0.7 + complexityFactor));

  return {
    modelCalls,
    tokens,
    usdCost,
    wallClockTime,
    withinBudget: true
  };
}

export function normalizePayoutToUsd(jobSpec, pricing = {}) {
  const config = { ...DEFAULT_PRICING, ...pricing };

  if (typeof jobSpec.payoutUsd === "number") {
    return { payoutUsd: normalizeNumber(jobSpec.payoutUsd), source: "payoutUsd" };
  }

  if (typeof jobSpec.payout === "number" || typeof jobSpec.payout === "string") {
    const payoutValue = normalizeNumber(jobSpec.payout);
    const payoutCurrency = String(jobSpec.payoutCurrency ?? "USD").toUpperCase();

    if (payoutCurrency === "USD") {
      return { payoutUsd: payoutValue, source: "payout:USD" };
    }

    if (payoutCurrency === "AGIALPHA") {
      return {
        payoutUsd: Number((payoutValue * config.agiAlphaToUsd).toFixed(6)),
        source: "payout:AGIALPHA"
      };
    }
  }

  return { payoutUsd: 0, source: "unavailable" };
}

export function evaluateMargin(payoutUsd, executionCostUsd, requiredMultiplier = 1.25) {
  const minRequired = Number((executionCostUsd * requiredMultiplier).toFixed(6));
  const marginMultiple = executionCostUsd > 0 ? payoutUsd / executionCostUsd : 0;

  return {
    payoutUsd,
    executionCostUsd,
    requiredMultiplier,
    minRequired,
    marginMultiple: Number(marginMultiple.toFixed(4)),
    passes: payoutUsd >= minRequired
  };
}
