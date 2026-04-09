function clampScore(value, min = 0, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function deriveDeliverableCount(jobSpec) {
  if (Number.isInteger(jobSpec.deliverableCount) && jobSpec.deliverableCount > 0) {
    return jobSpec.deliverableCount;
  }

  if (Array.isArray(jobSpec.deliverables) && jobSpec.deliverables.length > 0) {
    return jobSpec.deliverables.length;
  }

  if (Array.isArray(jobSpec.expectedOutputs) && jobSpec.expectedOutputs.length > 0) {
    return jobSpec.expectedOutputs.length;
  }

  return 1;
}

function deriveCrossArtifactDependencies(jobSpec) {
  if (typeof jobSpec.crossArtifactDependencies === "boolean") {
    return jobSpec.crossArtifactDependencies;
  }

  if (Array.isArray(jobSpec.dependencies) && jobSpec.dependencies.length > 0) {
    return true;
  }

  return false;
}

function deriveAmbiguityScore(jobSpec) {
  if (typeof jobSpec.ambiguityScore === "number") {
    return clampScore(jobSpec.ambiguityScore);
  }

  const text = `${jobSpec.title ?? ""} ${jobSpec.description ?? ""}`.toLowerCase();
  const ambiguitySignals = ["maybe", "unclear", "open-ended", "explore", "tbd", "flexible"];
  let score = 2;

  for (const token of ambiguitySignals) {
    if (text.includes(token)) {
      score += 1.5;
    }
  }

  if (!jobSpec.acceptanceCriteria && !jobSpec.validationPlan) {
    score += 2;
  }

  return clampScore(score);
}

function deriveExternalToolsRequired(jobSpec) {
  if (Number.isInteger(jobSpec.externalToolsRequired) && jobSpec.externalToolsRequired >= 0) {
    return jobSpec.externalToolsRequired;
  }

  if (Array.isArray(jobSpec.externalTools)) {
    return jobSpec.externalTools.length;
  }

  return 0;
}

function deriveValidationAvailable(jobSpec) {
  if (typeof jobSpec.validationAvailable === "boolean") {
    return jobSpec.validationAvailable;
  }

  if (Array.isArray(jobSpec.acceptanceCriteria) && jobSpec.acceptanceCriteria.length > 0) {
    return true;
  }

  return Boolean(jobSpec.validationPlan || jobSpec.outputSchema || jobSpec.expectedFormat);
}

function deriveIterationRisk(jobSpec, derived) {
  if (typeof jobSpec.iterationRisk === "number") {
    return clampScore(jobSpec.iterationRisk);
  }

  let risk = derived.ambiguityScore * 0.5;

  if (derived.deliverableCount >= 3) {
    risk += 1.5;
  }

  if (derived.crossArtifactDependencies) {
    risk += 2;
  }

  if (!derived.validationAvailable) {
    risk += 1.5;
  }

  return clampScore(risk);
}

export function extractJobFeatures(jobSpec) {
  if (!jobSpec || typeof jobSpec !== "object") {
    throw new Error("jobSpec must be an object");
  }

  const features = {
    deliverableCount: deriveDeliverableCount(jobSpec),
    crossArtifactDependencies: deriveCrossArtifactDependencies(jobSpec),
    ambiguityScore: deriveAmbiguityScore(jobSpec),
    externalToolsRequired: deriveExternalToolsRequired(jobSpec),
    validationAvailable: deriveValidationAvailable(jobSpec)
  };

  features.iterationRisk = deriveIterationRisk(jobSpec, features);

  const reasons = [
    `deliverableCount=${features.deliverableCount}`,
    `crossArtifactDependencies=${features.crossArtifactDependencies}`,
    `ambiguityScore=${features.ambiguityScore}`,
    `externalToolsRequired=${features.externalToolsRequired}`,
    `validationAvailable=${features.validationAvailable}`,
    `iterationRisk=${features.iterationRisk}`
  ];

  return { features, reasons };
}
