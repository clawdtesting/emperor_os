import { getTierRule } from "./policy-engine.js";
import { createBudgetGuard, isRepairableFailure } from "./runtime-guards.js";

function normalizeExecutionResult(output, tokensUsed = 0) {
  return {
    output,
    tokensUsed: Number.isFinite(tokensUsed) ? tokensUsed : 0
  };
}

export async function runTierT1OneShot(context, handlers) {
  const tierRule = getTierRule("T1_ONE_SHOT");
  const guard = createBudgetGuard({
    maxModelCalls: tierRule.maxModelCalls,
    maxTokens: context.maxTokens
  });

  guard.assertCapacity(context.tokensPerCall);
  const draft = await handlers.generateDraft({ context, passIndex: 1, tier: "T1_ONE_SHOT" });
  const draftResult = normalizeExecutionResult(draft.output, draft.tokensUsed ?? context.tokensPerCall);
  const usage = guard.consume(draftResult.tokensUsed);
  const validation = await handlers.validate({ context, output: draftResult.output, passIndex: 1, tier: "T1_ONE_SHOT" });

  return {
    tier: "T1_ONE_SHOT",
    passes: [{ passIndex: 1, output: draftResult.output, validation }],
    finalOutput: draftResult.output,
    validation,
    usage,
    completed: Boolean(validation?.passed)
  };
}

export async function runTierT2RepairLoop(context, handlers) {
  const tierRule = getTierRule("T2_REPAIR_LOOP");
  const guard = createBudgetGuard({
    maxModelCalls: tierRule.maxModelCalls,
    maxTokens: context.maxTokens
  });

  const passes = [];
  let currentOutput = null;

  for (let passIndex = 1; passIndex <= tierRule.maxModelCalls; passIndex += 1) {
    guard.assertCapacity(context.tokensPerCall);

    if (passIndex === 1 || !currentOutput) {
      const draft = await handlers.generateDraft({ context, passIndex, tier: "T2_REPAIR_LOOP" });
      const draftResult = normalizeExecutionResult(draft.output, draft.tokensUsed ?? context.tokensPerCall);
      guard.consume(draftResult.tokensUsed);
      currentOutput = draftResult.output;
    } else {
      const repaired = await handlers.repair({ context, passIndex, tier: "T2_REPAIR_LOOP", currentOutput, previousValidation: passes[passes.length - 1].validation });
      const repairedResult = normalizeExecutionResult(repaired.output, repaired.tokensUsed ?? context.tokensPerCall);
      guard.consume(repairedResult.tokensUsed);
      currentOutput = repairedResult.output;
    }

    const validation = await handlers.validate({ context, output: currentOutput, passIndex, tier: "T2_REPAIR_LOOP" });
    passes.push({ passIndex, output: currentOutput, validation });

    if (validation?.passed) {
      return {
        tier: "T2_REPAIR_LOOP",
        passes,
        finalOutput: currentOutput,
        validation,
        usage: guard.usage(),
        completed: true
      };
    }

    if (!isRepairableFailure(validation)) {
      return {
        tier: "T2_REPAIR_LOOP",
        passes,
        finalOutput: currentOutput,
        validation,
        usage: guard.usage(),
        completed: false,
        terminalFailure: true
      };
    }
  }

  return {
    tier: "T2_REPAIR_LOOP",
    passes,
    finalOutput: currentOutput,
    validation: passes[passes.length - 1]?.validation ?? null,
    usage: guard.usage(),
    completed: false,
    terminalFailure: false,
    reason: "max_repair_calls_reached"
  };
}

export async function runTierT3PlannerExecutor(context, handlers) {
  const tierRule = getTierRule("T3_PLANNER_EXECUTOR");
  const guard = createBudgetGuard({
    maxModelCalls: tierRule.maxModelCalls,
    maxTokens: context.maxTokens
  });

  guard.assertCapacity(context.tokensPerCall);
  const planResult = await handlers.plan({ context, tier: "T3_PLANNER_EXECUTOR" });
  const plan = Array.isArray(planResult?.steps) ? planResult.steps : [];
  guard.consume(planResult?.tokensUsed ?? context.tokensPerCall);

  const outputs = [];
  for (let i = 0; i < plan.length; i += 1) {
    guard.assertCapacity(context.tokensPerCall);
    const stepOutput = await handlers.executePlanStep({
      context,
      tier: "T3_PLANNER_EXECUTOR",
      stepIndex: i,
      step: plan[i]
    });

    guard.consume(stepOutput?.tokensUsed ?? context.tokensPerCall);
    outputs.push(stepOutput?.output ?? null);
  }

  const finalOutput = await handlers.finalizePlan({ context, tier: "T3_PLANNER_EXECUTOR", plan, outputs });
  const validation = await handlers.validate({ context, output: finalOutput?.output, passIndex: 1, tier: "T3_PLANNER_EXECUTOR" });

  return {
    tier: "T3_PLANNER_EXECUTOR",
    plan,
    outputs,
    finalOutput: finalOutput?.output,
    validation,
    usage: guard.usage(),
    completed: Boolean(validation?.passed)
  };
}
