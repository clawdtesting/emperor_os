function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function scoreComplexity(features) {
  const components = {
    deliverableCount: Math.min(features.deliverableCount * 8, 24),
    crossArtifactDependencies: features.crossArtifactDependencies ? 20 : 0,
    ambiguityScore: features.ambiguityScore * 2,
    externalToolsRequired: Math.min(features.externalToolsRequired * 8, 24),
    validationPenalty: features.validationAvailable ? 0 : 10,
    iterationRisk: features.iterationRisk * 2
  };

  const total = clampScore(Object.values(components).reduce((sum, value) => sum + value, 0));

  const reasons = Object.entries(components)
    .map(([key, value]) => `${key}=${value}`)
    .sort((a, b) => {
      const av = Number(a.split("=")[1]);
      const bv = Number(b.split("=")[1]);
      return bv - av;
    });

  return {
    score: total,
    band: total <= 35 ? "LOW" : total <= 65 ? "MEDIUM" : "HIGH",
    reasons
  };
}
