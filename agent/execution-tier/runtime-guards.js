export function createBudgetGuard({ maxModelCalls, maxTokens }) {
  const state = {
    modelCalls: 0,
    tokens: 0,
    maxModelCalls,
    maxTokens
  };

  function assertCapacity(nextTokens = 0) {
    if (state.modelCalls + 1 > state.maxModelCalls) {
      throw new Error("model_call_budget_exceeded");
    }

    if (state.tokens + nextTokens > state.maxTokens) {
      throw new Error("token_budget_exceeded");
    }
  }

  function consume(tokensUsed = 0) {
    assertCapacity(tokensUsed);
    state.modelCalls += 1;
    state.tokens += tokensUsed;
    return usage();
  }

  function usage() {
    return {
      modelCalls: state.modelCalls,
      tokens: state.tokens,
      maxModelCalls: state.maxModelCalls,
      maxTokens: state.maxTokens,
      remainingModelCalls: state.maxModelCalls - state.modelCalls,
      remainingTokens: state.maxTokens - state.tokens
    };
  }

  return {
    consume,
    usage,
    assertCapacity
  };
}

export function enforceValidationGate(validationResult) {
  if (!validationResult?.passed) {
    throw new Error("validation_gate_failed");
  }

  return true;
}

export function isRepairableFailure(validationResult) {
  if (!validationResult || validationResult.passed) {
    return false;
  }

  const repairableCodes = new Set([
    "FORMAT_MISMATCH",
    "MISSING_SECTION",
    "STYLE_NON_COMPLIANT",
    "SCHEMA_FIXABLE"
  ]);

  return repairableCodes.has(validationResult.code);
}
