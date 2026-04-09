import { shouldApply } from "./apply-gate.js";

export const ROLLOUT_MODES = Object.freeze({
  DRY_RUN: "dry_run",
  SHADOW: "shadow",
  ENFORCE: "enforce"
});

export function createRolloutController({ mode = ROLLOUT_MODES.DRY_RUN } = {}) {
  if (!Object.values(ROLLOUT_MODES).includes(mode)) {
    throw new Error(`invalid_rollout_mode:${mode}`);
  }

  const telemetry = {
    mode,
    totalEvaluated: 0,
    appliesAllowed: 0,
    appliesBlocked: 0,
    rejectionReasonCounts: {},
    marginMultiples: [],
    decisions: []
  };

  function recordDecision(jobId, decision) {
    telemetry.totalEvaluated += 1;
    if (decision.shouldApply) {
      telemetry.appliesAllowed += 1;
    } else {
      telemetry.appliesBlocked += 1;
      for (const reason of decision.rejectionReasons) {
        telemetry.rejectionReasonCounts[reason] = (telemetry.rejectionReasonCounts[reason] ?? 0) + 1;
      }
    }

    telemetry.marginMultiples.push(decision.economic.margin.marginMultiple);
    telemetry.decisions.push({
      jobId,
      shouldApply: decision.shouldApply,
      rejectionReasons: [...decision.rejectionReasons],
      marginMultiple: decision.economic.margin.marginMultiple,
      selectedTier: decision.selectedTier
    });
  }

  function evaluate(jobSpec, protocolId, options = {}) {
    const decision = shouldApply(jobSpec, protocolId, options);
    recordDecision(jobSpec.jobId ?? "unknown", decision);

    if (mode === ROLLOUT_MODES.DRY_RUN) {
      return { mode, shouldApply: false, decision, simulated: true };
    }

    if (mode === ROLLOUT_MODES.SHADOW) {
      return { mode, shouldApply: decision.shouldApply, decision, shadowOnly: true };
    }

    return { mode, shouldApply: decision.shouldApply, decision, enforce: true };
  }

  function snapshot() {
    const avgMargin = telemetry.marginMultiples.length > 0
      ? telemetry.marginMultiples.reduce((sum, value) => sum + value, 0) / telemetry.marginMultiples.length
      : 0;

    return {
      ...telemetry,
      averageMarginMultiple: Number(avgMargin.toFixed(4))
    };
  }

  return {
    evaluate,
    snapshot
  };
}
