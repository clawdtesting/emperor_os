// validation/settlement-reconciler.js
// Validator settlement reconciliation module.
//
// After score reveal phase completes, this module:
//   1. Aggregates all validator scores from on-chain events
//   2. Detects anomalies (outlier scores, potential collusion)
//   3. Computes consensus winner designation
//   4. Reconciles settlement state against on-chain truth
//   5. Produces settlement report for operator review
//
// SAFETY CONTRACT: Read-only analysis + unsigned tx packaging.
// No signing. No broadcasting. No private keys.

import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { getPrimeContract, getProvider, scanWinnerDesignatedEvents } from "../agent/prime-client.js";
import { deriveChainPhase, CHAIN_PHASE } from "../agent/prime-phase-model.js";
import { ensureProcSubdir, writeJson, readJson } from "../agent/prime-state.js";
import { VALIDATOR_CONFIG } from "./config.js";
import { isFinalizedBlock } from "../agent/prime-settlement.js";

async function fetchValidatorScores(procurementId) {
  const contract = getPrimeContract();
  const scores = [];
  const errors = [];

  try {
    const validatorCount = await contract.validatorCount?.(BigInt(procurementId));
    const count = validatorCount ? Number(validatorCount) : 0;

    for (let i = 0; i < count; i++) {
      try {
        const validatorAddr = await contract.validators?.(BigInt(procurementId), BigInt(i));
        if (!validatorAddr) continue;

        const scoreData = await contract.validatorScores?.(BigInt(procurementId), validatorAddr);
        if (scoreData) {
          scores.push({
            validator: String(validatorAddr).toLowerCase(),
            scoreCommitment: String(scoreData.commitment ?? scoreData[0] ?? ""),
            scoreRevealed: scoreData.revealed ?? scoreData[1] ?? false,
            score: scoreData.revealed ? Number(scoreData.score ?? scoreData[2] ?? 0) : null,
            salt: scoreData.revealed ? String(scoreData.salt ?? scoreData[3] ?? "") : null,
          });
        }
      } catch (err) {
        errors.push(`Failed to fetch validator ${i}: ${err.message}`);
      }
    }
  } catch (err) {
    errors.push(`Failed to enumerate validators: ${err.message}`);
  }

  return { scores, errors, fetchedAt: new Date().toISOString() };
}

function detectOutlierScores(scores, threshold = VALIDATOR_CONFIG.DISPUTE_SCORE_DELTA) {
  if (scores.length < 3) return { outliers: [], consensus: null };

  const revealed = scores.filter(s => s.score !== null && s.scoreRevealed);
  if (revealed.length < 2) return { outliers: [], consensus: null };

  const values = revealed.map(s => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

  const outliers = revealed.filter(s => Math.abs(s.score - mean) > threshold);
  const consensus = {
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };

  return { outliers, consensus };
}

function detectCollusion(scores) {
  if (!VALIDATOR_CONFIG.COLLUSION_DETECTION_ENABLED) return { suspected: [], checks: [] };
  if (scores.length < 2) return { suspected: [], checks: [] };

  const revealed = scores.filter(s => s.score !== null && s.scoreRevealed);
  const checks = [];
  const suspected = [];

  for (let i = 0; i < revealed.length; i++) {
    for (let j = i + 1; j < revealed.length; j++) {
      const scoreDiff = Math.abs(revealed[i].score - revealed[j].score);
      const identical = scoreDiff === 0;
      checks.push({
        pair: [revealed[i].validator, revealed[j].validator],
        scoreDiff,
        identical,
        suspicious: identical && revealed[i].score > 0,
      });
      if (identical && revealed[i].score > 0) {
        suspected.push({
          validators: [revealed[i].validator, revealed[j].validator],
          reason: "identical_nonzero_scores",
          score: revealed[i].score,
        });
      }
    }
  }

  return { suspected, checks };
}

function computeConsensusWinner(scores, applicantAddresses) {
  const revealed = scores.filter(s => s.score !== null && s.scoreRevealed);
  if (revealed.length === 0) return { winner: null, confidence: 0, reason: "no_revealed_scores" };

  const scoreByApplicant = {};
  for (const addr of applicantAddresses) {
    const addrLower = addr.toLowerCase();
    const appScores = revealed.filter(s => s.validator === addrLower);
    if (appScores.length > 0) {
      const avg = appScores.reduce((sum, s) => sum + s.score, 0) / appScores.length;
      scoreByApplicant[addrLower] = {
        averageScore: Math.round(avg * 100) / 100,
        scoreCount: appScores.length,
        scores: appScores.map(s => s.score),
      };
    }
  }

  const entries = Object.entries(scoreByApplicant);
  if (entries.length === 0) return { winner: null, confidence: 0, reason: "no_applicant_scores" };

  entries.sort((a, b) => b[1].averageScore - a[1].averageScore);
  const [winner, winnerData] = entries[0];
  const runnerUp = entries[1]?.[1]?.averageScore ?? 0;
  const margin = winnerData.averageScore - runnerUp;

  const confidence = margin > 0 ? Math.min(1, margin / 50) : 0;

  return {
    winner,
    winnerData,
    runnerUpScore: runnerUp,
    margin,
    confidence: Math.round(confidence * 10000) / 10000,
    allScores: scoreByApplicant,
  };
}

export async function reconcileValidatorSettlement(procurementId, applicantAddresses = []) {
  const [scoreData, winnerEvent] = await Promise.all([
    fetchValidatorScores(procurementId),
    (async () => {
      try {
        const provider = getProvider();
        const currentBlock = await provider.getBlockNumber();
        const events = await scanWinnerDesignatedEvents(
          Math.max(0, currentBlock - 10000),
          currentBlock
        );
        return events.find(e => String(e.procurementId) === String(procurementId)) || null;
      } catch {
        return null;
      }
    })(),
  ]);

  const { outliers, consensus } = detectOutlierScores(scoreData.scores);
  const collusion = detectCollusion(scoreData.scores);
  const consensusWinner = computeConsensusWinner(scoreData.scores, applicantAddresses);

  const report = {
    schema: "emperor-os/validator-settlement-report/v1",
    procurementId: String(procurementId),
    scores: scoreData,
    outlierAnalysis: {
      outliers: outliers.map(o => ({
        validator: o.validator,
        score: o.score,
        deviation: Math.round((o.score - consensus.mean) * 100) / 100,
      })),
      consensus,
    },
    collusionAnalysis: collusion,
    consensusWinner,
    onChainWinner: winnerEvent ? {
      winner: winnerEvent.winner,
      blockNumber: winnerEvent.blockNumber,
      txHash: winnerEvent.transactionHash,
    } : null,
    settlementStatus: winnerEvent
      ? (winnerEvent.winner.toLowerCase() === consensusWinner.winner?.toLowerCase()
        ? "RECONCILED"
        : "DISCREPANCY_DETECTED")
      : "PENDING",
    generatedAt: new Date().toISOString(),
  };

  const scoringDir = await ensureProcSubdir(procurementId, "scoring");
  await writeJson(path.join(scoringDir, "settlement_report.json"), report);

  return report;
}

export async function monitorSettlementFinality(procurementId, eventBlockNumber) {
  const provider = getProvider();
  const currentBlock = await provider.getBlockNumber();
  const finalized = isFinalizedBlock(eventBlockNumber, currentBlock, VALIDATOR_CONFIG.SETTLEMENT_FINALITY_DEPTH);

  return {
    procurementId: String(procurementId),
    eventBlock: eventBlockNumber,
    currentBlock,
    finalityDepth: currentBlock - eventBlockNumber,
    requiredDepth: VALIDATOR_CONFIG.SETTLEMENT_FINALITY_DEPTH,
    finalized,
    checkedAt: new Date().toISOString(),
  };
}
