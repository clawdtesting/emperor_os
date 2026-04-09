import { shouldApply } from "./apply-gate.js";
import { shouldEscalate } from "./escalation-controller.js";
import { enforceValidationGate, isRepairableFailure } from "./runtime-guards.js";
import { runTierT1OneShot, runTierT2RepairLoop, runTierT3PlannerExecutor } from "./runners.js";

const TIER_ORDER = ["T1_ONE_SHOT", "T2_REPAIR_LOOP", "T3_PLANNER_EXECUTOR"];

function nextTier(currentTier) {
  const index = TIER_ORDER.indexOf(currentTier);
  if (index < 0 || index + 1 >= TIER_ORDER.length) {
    return null;
  }
  return TIER_ORDER[index + 1];
}

function makeContext(jobSpec, protocolId, options = {}) {
  return {
    jobSpec,
    protocolId,
    tokensPerCall: options.tokensPerCall ?? 900,
    maxTokens: options.maxTokens ?? 12000,
    metadata: options.metadata ?? {}
  };
}

export async function executeWithEscalation(jobSpec, protocolId, handlers, options = {}) {
  const applyDecision = shouldApply(jobSpec, protocolId, options);
  if (!applyDecision.shouldApply) {
    return {
      status: "NOT_APPLIED",
      applyDecision
    };
  }

  let currentTier = applyDecision.selectedTier;
  let escalationCount = 0;
  const attemptLog = [];

  while (currentTier) {
    const context = makeContext(jobSpec, protocolId, options);
    let runResult;

    if (currentTier === "T1_ONE_SHOT") {
      runResult = await runTierT1OneShot(context, handlers);
    } else if (currentTier === "T2_REPAIR_LOOP") {
      runResult = await runTierT2RepairLoop(context, handlers);
    } else if (currentTier === "T3_PLANNER_EXECUTOR") {
      runResult = await runTierT3PlannerExecutor(context, handlers);
    } else {
      return {
        status: "FAILED",
        reason: `unsupported_tier_${currentTier}`,
        attemptLog
      };
    }

    attemptLog.push(runResult);

    if (runResult.completed) {
      enforceValidationGate(runResult.validation);
      return {
        status: "COMPLETED",
        finalTier: currentTier,
        applyDecision,
        attemptLog,
        validation: runResult.validation,
        finalOutput: runResult.finalOutput
      };
    }

    const candidateNextTier = nextTier(currentTier);
    if (!candidateNextTier) {
      return {
        status: "FAILED",
        reason: "no_escalation_path_available",
        applyDecision,
        attemptLog
      };
    }

    const budgetRemaining = Boolean(runResult.usage?.remainingModelCalls >= 0 && runResult.usage?.remainingTokens >= 0);
    const failureRepairable = isRepairableFailure(runResult.validation);

    const escalateDecision = shouldEscalate({
      protocolId,
      fromTier: currentTier,
      toTier: candidateNextTier,
      currentEscalations: escalationCount,
      budgetRemaining,
      failureRepairable
    });

    if (!escalateDecision.escalate) {
      return {
        status: "FAILED",
        reason: escalateDecision.reason,
        applyDecision,
        attemptLog
      };
    }

    escalationCount += 1;
    currentTier = candidateNextTier;
  }

  return {
    status: "FAILED",
    reason: "runtime_exhausted",
    applyDecision,
    attemptLog
  };
}
