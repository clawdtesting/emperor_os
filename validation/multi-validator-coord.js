// validation/multi-validator-coord.js
// Multi-validator coordination and consensus module.
//
// Handles:
//   - Validator registry discovery for a procurement
//   - Score aggregation across validators
//   - Consensus computation (weighted average, median, trimmed mean)
//   - Collusion detection via score correlation analysis
//   - Validator reputation tracking
//
// SAFETY CONTRACT: Pure computation. No network calls. No signing.

import { createHash } from "crypto";
import { VALIDATOR_CONFIG } from "./config.js";

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function trimmedMean(values, trimFraction = 0.1) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.max(1, Math.floor(sorted.length * trimFraction));
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (trimmed.length === 0) return median(sorted);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const xMean = xSlice.reduce((a, b) => a + b, 0) / n;
  const yMean = ySlice.reduce((a, b) => a + b, 0) / n;

  let num = 0, xDenom = 0, yDenom = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - xMean;
    const dy = ySlice[i] - yMean;
    num += dx * dy;
    xDenom += dx * dx;
    yDenom += dy * dy;
  }

  const denom = Math.sqrt(xDenom * yDenom);
  return denom === 0 ? 0 : num / denom;
}

export function aggregateScores(scoreRecords, method = "trimmed_mean") {
  if (!Array.isArray(scoreRecords) || scoreRecords.length === 0) {
    return { aggregated: null, method, count: 0, reason: "no_scores" };
  }

  const validScores = scoreRecords
    .filter(s => s.score !== null && s.score !== undefined)
    .map(s => ({ validator: s.validator, score: Number(s.score) }));

  if (validScores.length === 0) {
    return { aggregated: null, method, count: 0, reason: "no_valid_scores" };
  }

  const values = validScores.map(s => s.score);
  let aggregated;

  switch (method) {
    case "mean":
      aggregated = values.reduce((a, b) => a + b, 0) / values.length;
      break;
    case "median":
      aggregated = median(values);
      break;
    case "trimmed_mean":
      aggregated = trimmedMean(values, 0.1);
      break;
    default:
      aggregated = trimmedMean(values, 0.1);
  }

  return {
    aggregated: Math.round(aggregated * 100) / 100,
    method,
    count: validScores.length,
    min: Math.min(...values),
    max: Math.max(...values),
    stdDev: Math.round(Math.sqrt(values.reduce((sum, v) => {
      const diff = v - aggregated;
      return sum + diff * diff;
    }, values.length)) * 100) / 100,
    scores: validScores,
  };
}

export function detectCollusionPatterns(scoreRecords) {
  const collusionDetectionEnabled = String(process.env.VALIDATOR_COLLUSION_DETECTION ?? "true").toLowerCase() === "true";
  if (!collusionDetectionEnabled) {
    return { patterns: [], enabled: false };
  }

  if (!Array.isArray(scoreRecords) || scoreRecords.length < 3) {
    return { patterns: [], enabled: true, reason: "insufficient_validators" };
  }

  const validScores = scoreRecords.filter(s => s.score !== null && s.score !== undefined);
  if (validScores.length < 3) {
    return { patterns: [], enabled: true, reason: "insufficient_valid_scores" };
  }

  const patterns = [];
  const threshold = VALIDATOR_CONFIG.COLLUSION_SCORE_CORRELATION_THRESHOLD;

  for (let i = 0; i < validScores.length; i++) {
    for (let j = i + 1; j < validScores.length; j++) {
      const vi = validScores[i];
      const vj = validScores[j];

      if (vi.score === vj.score && vi.score > 0) {
        patterns.push({
          type: "identical_scores",
          validators: [vi.validator, vj.validator],
          score: vi.score,
          severity: "HIGH",
        });
      }

      const scoreDiff = Math.abs(vi.score - vj.score);
      if (scoreDiff <= 2 && vi.score > 50) {
        patterns.push({
          type: "suspiciously_close_high_scores",
          validators: [vi.validator, vj.validator],
          scores: [vi.score, vj.score],
          difference: scoreDiff,
          severity: "MEDIUM",
        });
      }
    }
  }

  const values = validScores.map(s => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

  if (stdDev < 3 && values.length >= 3) {
    patterns.push({
      type: "low_variance_across_validators",
      stdDev: Math.round(stdDev * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      validatorCount: values.length,
      severity: "MEDIUM",
    });
  }

  return { patterns, enabled: true };
}

export function computeConsensusDecision(scoreRecords, applicantAddresses) {
  const aggregation = aggregateScores(scoreRecords, "trimmed_mean");
  const collusion = detectCollusionPatterns(scoreRecords);

  const scoreByApplicant = {};
  for (const record of (aggregation.scores || [])) {
    const addr = record.validator.toLowerCase();
    if (!scoreByApplicant[addr]) {
      scoreByApplicant[addr] = [];
    }
    scoreByApplicant[addr].push(record.score);
  }

  const applicantAverages = Object.entries(scoreByApplicant).map(([addr, scores]) => ({
    address: addr,
    averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
    scoreCount: scores.length,
  }));

  applicantAverages.sort((a, b) => b.averageScore - a.averageScore);

  const winner = applicantAverages[0] || null;
  const runnerUp = applicantAverages[1] || null;
  const margin = winner && runnerUp ? winner.averageScore - runnerUp.averageScore : 0;

  const hasConsensus = aggregation.count >= VALIDATOR_CONFIG.MIN_VALIDATOR_COUNT &&
    margin > 5;

  return {
    schema: "emperor-os/validator-consensus/v1",
    aggregation,
    collusionAnalysis: collusion,
    applicantRanking: applicantAverages,
    winner: winner ? {
      address: winner.address,
      averageScore: winner.averageScore,
    } : null,
    margin,
    hasConsensus,
    consensusThreshold: VALIDATOR_CONFIG.CONSENSUS_THRESHOLD,
    minValidatorCount: VALIDATOR_CONFIG.MIN_VALIDATOR_COUNT,
    generatedAt: new Date().toISOString(),
  };
}

export function computeValidatorReputation(validatorAddress, historicalScores) {
  if (!Array.isArray(historicalScores) || historicalScores.length === 0) {
    return {
      validator: validatorAddress,
      reputation: 0.5,
      totalEvaluations: 0,
      reason: "no_history",
    };
  }

  const meanScore = historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length;
  const stdDev = Math.sqrt(
    historicalScores.reduce((sum, v) => sum + Math.pow(v - meanScore, 2), 0) / historicalScores.length
  );

  const consistency = Math.max(0, 1 - stdDev / 50);
  const experience = Math.min(1, historicalScores.length / 20);
  const reputation = consistency * 0.6 + experience * 0.4;

  return {
    validator: validatorAddress.toLowerCase(),
    reputation: Math.round(reputation * 10000) / 10000,
    totalEvaluations: historicalScores.length,
    meanScore: Math.round(meanScore * 100) / 100,
    consistency: Math.round(consistency * 10000) / 10000,
    experience: Math.round(experience * 10000) / 10000,
    stdDev: Math.round(stdDev * 100) / 100,
  };
}
