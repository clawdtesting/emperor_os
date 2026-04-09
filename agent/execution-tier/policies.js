export const EXECUTION_TIERS = Object.freeze([
  "T1_ONE_SHOT",
  "T2_REPAIR_LOOP",
  "T3_PLANNER_EXECUTOR",
  "T4_ORCHESTRATED"
]);

export const PROTOCOL_TIER_POLICY = Object.freeze({
  "AGIJobManager:v1": Object.freeze({
    protocolId: "AGIJobManager:v1",
    allowedExecutionTiers: Object.freeze(["T1_ONE_SHOT", "T2_REPAIR_LOOP"])
  }),
  "AGIPrime:v1": Object.freeze({
    protocolId: "AGIPrime:v1",
    allowedExecutionTiers: Object.freeze(["T1_ONE_SHOT", "T2_REPAIR_LOOP", "T3_PLANNER_EXECUTOR"])
  })
});

export const JOB_FEATURE_SCHEMA = Object.freeze({
  deliverableCount: Object.freeze({ type: "integer", min: 1 }),
  crossArtifactDependencies: Object.freeze({ type: "boolean" }),
  ambiguityScore: Object.freeze({ type: "number", min: 0, max: 10 }),
  externalToolsRequired: Object.freeze({ type: "integer", min: 0 }),
  validationAvailable: Object.freeze({ type: "boolean" }),
  iterationRisk: Object.freeze({ type: "number", min: 0, max: 10 })
});

export const ARCHETYPE_DEFAULT_TIER = Object.freeze({
  simple_content: "T1_ONE_SHOT",
  structured_research: "T2_REPAIR_LOOP",
  code_generation: "T2_REPAIR_LOOP",
  multi_file_build: "T3_PLANNER_EXECUTOR",
  procurement_application: "T2_REPAIR_LOOP",
  procurement_trial: "T3_PLANNER_EXECUTOR"
});

export const TIER_RULE_SCHEMA = Object.freeze({
  T1_ONE_SHOT: Object.freeze({
    maxModelCalls: 1,
    constraints: Object.freeze({
      deliverableCountMax: 1,
      ambiguityScoreMax: 3,
      externalToolsRequiredMax: 0,
      iterationRiskMax: 3
    })
  }),
  T2_REPAIR_LOOP: Object.freeze({
    maxModelCalls: 3,
    constraints: Object.freeze({
      deliverableCountMax: 3,
      validationAvailableRequired: true,
      iterationRiskMax: 7,
      decompositionRequiredMustBe: false
    })
  }),
  T3_PLANNER_EXECUTOR: Object.freeze({
    maxModelCalls: 8,
    constraints: Object.freeze({
      multipleDependentOutputsMin: 2,
      crossArtifactDependenciesRequired: true,
      ambiguityScoreMin: 7,
      externalToolsRequiredMin: 2
    })
  })
});

export const ESCALATION_POLICY_SCHEMA = Object.freeze({
  enabled: true,
  maxEscalations: 1,
  allowedPaths: Object.freeze([
    Object.freeze(["T1_ONE_SHOT", "T2_REPAIR_LOOP"]),
    Object.freeze(["T2_REPAIR_LOOP", "T3_PLANNER_EXECUTOR"])
  ])
});
