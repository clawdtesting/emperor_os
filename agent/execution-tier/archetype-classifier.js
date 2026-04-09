function hasCodeSignals(jobSpec) {
  const text = `${jobSpec.title ?? ""} ${jobSpec.description ?? ""}`.toLowerCase();
  return ["code", "refactor", "function", "api", "implementation", "javascript", "typescript"].some((token) => text.includes(token));
}

export function classifyArchetype(jobSpec, features) {
  if (jobSpec?.archetypeHint) {
    return {
      archetype: jobSpec.archetypeHint,
      reasons: [`archetypeHint=${jobSpec.archetypeHint}`]
    };
  }

  if (jobSpec?.protocolId === "AGIPrime:v1" && jobSpec?.procurementPhase === "TRIAL") {
    return {
      archetype: "procurement_trial",
      reasons: ["protocol=AGIPrime:v1", "procurementPhase=TRIAL"]
    };
  }

  if (jobSpec?.protocolId === "AGIPrime:v1") {
    return {
      archetype: "procurement_application",
      reasons: ["protocol=AGIPrime:v1"]
    };
  }

  if (features.crossArtifactDependencies && features.deliverableCount >= 2) {
    return {
      archetype: "multi_file_build",
      reasons: ["crossArtifactDependencies=true", `deliverableCount=${features.deliverableCount}`]
    };
  }

  if (hasCodeSignals(jobSpec)) {
    return {
      archetype: "code_generation",
      reasons: ["code_signals_detected"]
    };
  }

  if (features.deliverableCount === 1 && features.ambiguityScore <= 3 && features.externalToolsRequired === 0) {
    return {
      archetype: "simple_content",
      reasons: ["single_deliverable", "low_ambiguity", "no_external_tools"]
    };
  }

  return {
    archetype: "structured_research",
    reasons: ["default_classification"]
  };
}
